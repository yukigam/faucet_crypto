'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  Clock,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  Trophy,
  Loader2,
  Shield,
  RefreshCw,
  Play,
  MousePointerClick,
} from 'lucide-react';
import AdSlot from '@/components/AdSlot';
import { useBannerClickDetection } from '@/hooks/useBannerClickDetection';

const STORAGE_KEY = 'faucetpay_address';
const CURRENCY = 'TON';

type Phase = 'loading' | 'watching' | 'captcha' | 'claiming' | 'success' | 'error' | 'closed';

type AdInfo = {
  id: string;
  title: string;
  target_url: string;
  duration_seconds: number;
  reward: number;
};

type CaptchaChallenge = {
  a: number;
  b: number;
  answer: number;
  options: number[];
};

function fmtAmount(n: number): string {
  return n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateCaptcha(): CaptchaChallenge {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  const answer = a + b;
  const distractors = new Set<number>();
  while (distractors.size < 3) {
    const d = answer + Math.floor(Math.random() * 11) - 5;
    if (d !== answer && d >= 1 && d <= 20) distractors.add(d);
  }
  return {
    a,
    b,
    answer,
    options: shuffle([answer, ...distractors]),
  };
}

export default function PtcViewByIdPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(params);

  const [phase, setPhase] = useState<Phase>('loading');
  const [address, setAddress] = useState<string | null>(null);
  const [adInfo, setAdInfo] = useState<AdInfo | null>(null);
  const [errorText, setErrorText] = useState('');

  const [bannerClicked, setBannerClicked] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(10);
  const [isPaused, setIsPaused] = useState(false);
  const [pauseReason, setPauseReason] = useState<'banner' | 'focus' | null>(null);
  const [tabActive, setTabActive] = useState(true);

  const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null);
  const [captchaError, setCaptchaError] = useState('');

  const [claimResult, setClaimResult] = useState<{
    reward: number;
    txid?: string;
    warning?: string;
  } | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickSentRef = useRef<number>(0);
  const addressRef = useRef<string | null>(null);

  useEffect(() => {
    addressRef.current = localStorage.getItem(STORAGE_KEY);
    setAddress(addressRef.current);
  }, []);

  const isPageActive = useCallback((): boolean => {
    return !document.hidden && document.hasFocus();
  }, []);

  const duration = adInfo?.duration_seconds ?? 10;
  const progress = duration > 0 ? ((duration - secondsLeft) / duration) * 100 : 0;

  const handleBannerDetected = useCallback(() => {
    if (phase !== 'watching') return;
    setBannerClicked(true);
    if (isPageActive()) {
      setIsPaused(false);
      setPauseReason(null);
    }
  }, [phase, isPageActive]);

  useEffect(() => {
    if (phase !== 'watching') return;

    const handleActivity = () => {
      const active = isPageActive();
      setTabActive(active);
      if (!active) {
        setIsPaused(true);
        setPauseReason('focus');
        return;
      }
      if (!bannerClicked) {
        setIsPaused(true);
        setPauseReason('banner');
        return;
      }
      setIsPaused(false);
      setPauseReason(null);
    };

    document.addEventListener('visibilitychange', handleActivity);
    window.addEventListener('blur', handleActivity);
    window.addEventListener('focus', handleActivity);
    const id = requestAnimationFrame(() => handleActivity());

    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener('visibilitychange', handleActivity);
      window.removeEventListener('blur', handleActivity);
      window.removeEventListener('focus', handleActivity);
    };
  }, [phase, isPageActive, bannerClicked]);

  useBannerClickDetection(phase === 'watching' && !bannerClicked, handleBannerDetected);

  const sendWatchTick = useCallback(async () => {
    if (!addressRef.current || !adInfo) return;
    try {
      await fetch('/api/ptc/watch-tick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: `${adInfo.id}:${addressRef.current}:${Date.now()}`,
        }),
      }).catch(() => {});
    } catch {}
  }, [adInfo]);

  useEffect(() => {
    if (phase !== 'watching' || isPaused || !bannerClicked) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setPhase('captcha');
          setCaptcha(generateCaptcha());
          return 0;
        }
        tickSentRef.current++;
        if (tickSentRef.current % 5 === 0) {
          void sendWatchTick();
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [phase, isPaused, bannerClicked, sendWatchTick]);

  useEffect(() => {
    if (!id || !address) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/ptc/ads?address=${encodeURIComponent(address)}`);
        const data = await res.json();
        if (cancelled) return;

        const ads = Array.isArray(data.ads) ? (data.ads as AdInfo[]) : [];
        const ad = ads.find((a) => a.id === id);

        if (!ad) {
          setErrorText('Ad not found or unavailable.');
          setPhase('error');
          return;
        }

        setAdInfo(ad);
        setSecondsLeft(ad.duration_seconds ?? 10);
        setBannerClicked(false);
        setIsPaused(true);
        setPauseReason('banner');
        setPhase('watching');
      } catch {
        if (!cancelled) {
          setErrorText('Failed to load ad details.');
          setPhase('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, address]);

  const handleClose = useCallback(() => {
    setPhase('closed');
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/ptc');
    }
  }, [router]);

  const claimReward = useCallback(async () => {
    if (!adInfo || !addressRef.current) return;
    setPhase('claiming');
    setErrorText('');

    try {
      const res = await fetch('/api/ptc/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: addressRef.current,
          adId: adInfo.id,
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setClaimResult({
          reward: data.reward,
          txid: data.txid,
          warning: data.warning,
        });
        setPhase('success');
        const t = setTimeout(() => {
          clearTimeout(t);
          if (window.opener && !window.opener.closed) {
            window.close();
          } else {
            router.push('/ptc?msg=rewarded');
          }
        }, 2000);
      } else {
        setErrorText(data.error || 'Failed to claim reward.');
        setPhase('error');
      }
    } catch {
      setErrorText('Network error while claiming reward.');
      setPhase('error');
    }
  }, [adInfo, router]);

  const handleCaptchaSelect = useCallback(
    (choice: number) => {
      if (!captcha || phase !== 'captcha') return;
      setCaptchaError('');

      if (choice === captcha.answer) {
        void claimReward();
      } else {
        setCaptchaError('Wrong answer! Try a new challenge.');
        setCaptcha(generateCaptcha());
      }
    },
    [captcha, phase, claimReward],
  );

  const handleRefreshCaptcha = useCallback(() => {
    setCaptchaError('');
    setCaptcha(generateCaptcha());
  }, []);

  const statusMessage = useMemo(() => {
    if (phase === 'claiming') return 'Sending reward to FaucetPay…';
    if (phase === 'captcha') return 'Timer complete! Solve the captcha to claim.';
    if (phase === 'success') return 'Reward paid instantly to your FaucetPay account.';
    if (isPaused && pauseReason === 'focus') return 'Timer paused! Please stay on this tab';
    if (isPaused && pauseReason === 'banner') return 'Click the banner below to start the timer';
    if (isPaused) return 'Timer paused.';
    return 'Keep this tab visible — timer counts only while you watch.';
  }, [phase, isPaused, pauseReason]);

  const timerDisplayColor =
    phase === 'success' || phase === 'claiming'
      ? 'text-emerald-400'
      : isPaused
        ? 'text-amber-400'
        : 'text-white';

  return (
    <div className="min-h-screen w-full bg-gray-950 text-white flex flex-col">
      <header className="sticky top-0 z-30 border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm">
        <div className="w-full max-w-4xl mx-auto flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-1.5 rounded-full bg-cyan-500/15 px-3 py-1.5 border border-cyan-500/30">
              <Clock className="w-4 h-4 text-cyan-400" strokeWidth={2.25} />
              <span
                className={`font-mono text-lg font-extrabold tabular-nums ${timerDisplayColor}`}
              >
                {phase === 'watching' || phase === 'captcha' ? `${secondsLeft}s` : '—'}
              </span>
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-sm truncate">
                {adInfo?.title ?? 'Loading ad…'}
              </h2>
              <p
                className={`text-xs font-medium truncate ${
                  isPaused && pauseReason === 'focus'
                    ? 'text-amber-400'
                    : isPaused && pauseReason === 'banner'
                      ? 'text-violet-300'
                      : phase === 'success'
                        ? 'text-emerald-400'
                        : 'text-gray-400'
                }`}
              >
                {isPaused && pauseReason === 'focus' ? (
                  <span className="inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {statusMessage}
                  </span>
                ) : isPaused && pauseReason === 'banner' ? (
                  <span className="inline-flex items-center gap-1">
                    <MousePointerClick className="w-3 h-3" />
                    {statusMessage}
                  </span>
                ) : phase === 'success' ? (
                  <span className="inline-flex items-center gap-1">
                    <Trophy className="w-3 h-3" />
                    {statusMessage}
                  </span>
                ) : (
                  statusMessage
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            aria-label="Close / Exit"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-gray-800 hover:bg-red-500/80 border border-gray-700 hover:border-red-500/60 px-3 py-1.5 text-xs font-semibold text-gray-300 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" strokeWidth={2.25} />
            Exit
          </button>
        </div>

        <div className="h-1 w-full bg-gray-800">
          <div
            className={`h-full transition-[width] duration-700 ease-linear ${
              isPaused
                ? 'bg-amber-400'
                : phase === 'captcha' || phase === 'success'
                  ? 'bg-emerald-400'
                  : 'bg-gradient-to-r from-cyan-400 to-indigo-500'
            }`}
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      </header>

      {isPaused && pauseReason === 'focus' && phase === 'watching' && (
        <div className="w-full border-b border-amber-500/40 bg-amber-500/10">
          <div className="max-w-4xl mx-auto px-4 py-2 flex items-center justify-center gap-2">
            <EyeOff className="w-4 h-4 text-amber-400" strokeWidth={2.25} />
            <p className="text-sm font-semibold text-amber-300">
              Timer paused! Please stay on this tab — switch back to resume.
            </p>
          </div>
        </div>
      )}

      {isPaused && pauseReason === 'banner' && phase === 'watching' && (
        <div className="w-full border-b border-violet-500/40 bg-violet-500/10">
          <div className="max-w-4xl mx-auto px-4 py-2 flex items-center justify-center gap-2">
            <Play className="w-4 h-4 text-violet-400 animate-pulse" strokeWidth={2.25} />
            <p className="text-sm font-semibold text-violet-300">
              👆 Click the Adsterra banner ad below to start the countdown timer
            </p>
          </div>
        </div>
      )}

      {!isPaused && tabActive && phase === 'watching' && (
        <div className="w-full border-b border-emerald-500/30 bg-emerald-500/5">
          <div className="max-w-4xl mx-auto px-4 py-2 flex items-center justify-center gap-2">
            <Eye className="w-4 h-4 text-emerald-400" strokeWidth={2.25} />
            <p className="text-xs font-semibold text-emerald-300">
              Watching now — timer is running. Reward:{' '}
              <span className="font-extrabold text-emerald-400">
                {fmtAmount(adInfo?.reward ?? 0)} {CURRENCY}
              </span>
            </p>
          </div>
        </div>
      )}

      <main className="flex-1 flex items-start justify-center p-3 sm:p-6">
        <div className="w-full max-w-4xl">
          {phase === 'loading' && (
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-10 text-center">
              <Loader2 className="w-8 h-8 mx-auto text-cyan-400 animate-spin mb-3" />
              <p className="text-sm text-gray-400">Loading advertisement…</p>
            </div>
          )}

          {phase === 'watching' && adInfo && (
            <div className="space-y-4 max-w-2xl mx-auto">
              <div className="rounded-2xl border border-gray-800 bg-gradient-to-br from-gray-900 to-gray-900/60 p-5 sm:p-8 shadow-2xl">
                <div className="rounded-xl bg-gray-950/60 border border-gray-800 px-4 py-3 mb-5 space-y-1.5 text-center">
                  <p className="text-[11px] font-extrabold uppercase tracking-widest text-amber-400">
                    📢 How to earn — 3 steps
                  </p>
                  <ul className="space-y-1 text-[13px] font-bold leading-snug text-white">
                    <li className={`flex items-center justify-center gap-2 ${bannerClicked ? 'text-emerald-400' : 'animate-pulse text-amber-300'}`}>
                      <span aria-hidden>{bannerClicked ? '✅' : '👆'}</span>
                      <span>Click the Adsterra banner below to start the timer</span>
                    </li>
                    <li className={`flex items-center justify-center gap-2 ${!isPaused && bannerClicked ? 'text-cyan-300' : 'text-gray-400'}`}>
                      <span aria-hidden>{!isPaused && bannerClicked ? '👀' : '⏸️'}</span>
                      <span>Stay on this page until the timer finishes</span>
                    </li>
                    <li className="flex items-center justify-center gap-2 text-emerald-400">
                      <span aria-hidden>💰</span>
                      <span>Solve the captcha → reward sent instantly to FaucetPay</span>
                    </li>
                  </ul>
                </div>

                <div className="rounded-xl bg-cyan-50/5 border border-cyan-500/20 px-5 py-3 mb-5 text-center">
                  <p className="text-xs text-cyan-300 font-medium">
                    Reward on completion:{' '}
                    <span className="font-extrabold text-emerald-400 text-base">
                      {fmtAmount(adInfo.reward)} {CURRENCY}
                    </span>
                    {' · '}
                    Watch time:{' '}
                    <span className="font-extrabold text-cyan-300">{duration}s</span>
                  </p>
                </div>

                <div
                  className={`rounded-2xl border-2 p-4 sm:p-6 transition-all duration-300 ${
                    !bannerClicked
                      ? 'border-violet-500/60 bg-violet-500/5 ring-4 ring-violet-500/20 shadow-[0_0_40px_-10px_rgba(139,92,246,0.5)]'
                      : 'border-emerald-500/40 bg-emerald-500/5'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <p
                      className={`text-[11px] font-extrabold uppercase tracking-widest ${
                        !bannerClicked ? 'text-violet-400 animate-pulse' : 'text-emerald-400'
                      }`}
                    >
                      {!bannerClicked ? '▼ Click this banner ▼' : '✓ Banner viewed'}
                    </p>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                        !bannerClicked
                          ? 'bg-violet-500 text-white animate-bounce'
                          : 'bg-emerald-500 text-white'
                      }`}
                    >
                      {!bannerClicked ? 'START HERE' : 'DONE'}
                    </span>
                  </div>
                  <div className="flex items-center justify-center w-full">
                    <div className="w-full max-w-[300px]">
                      <AdSlot slot="ptcView" trackPtcBanner />
                    </div>
                  </div>
                </div>

                <div
                  className={`mt-5 rounded-xl border-2 px-5 py-4 text-center transition-colors ${
                    bannerClicked
                      ? isPaused
                        ? 'border-amber-300 bg-amber-50/10'
                        : 'border-emerald-300 bg-emerald-50/10'
                      : 'border-violet-300 bg-violet-50/10'
                  }`}
                >
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest text-white ${
                      bannerClicked
                        ? isPaused
                          ? 'bg-amber-500'
                          : 'animate-pulse bg-emerald-500'
                        : 'bg-violet-500 animate-pulse'
                    }`}
                  >
                    {!bannerClicked ? (
                      <>
                        <Play className="w-3 h-3" />
                        Waiting for click
                      </>
                    ) : isPaused ? (
                      <>
                        <EyeOff className="w-3 h-3" />
                        Paused
                      </>
                    ) : (
                      <>
                        <Eye className="w-3 h-3" />
                        Watching
                      </>
                    )}
                  </span>
                  <p
                    className={`mt-1.5 font-mono text-4xl sm:text-5xl font-extrabold tabular-nums ${
                      bannerClicked
                        ? isPaused
                          ? 'text-amber-400'
                          : secondsLeft === 0
                            ? 'text-emerald-400'
                            : 'text-white'
                        : 'text-violet-300'
                    }`}
                  >
                    {bannerClicked ? (isPaused ? '⏸' : `${secondsLeft}s`) : `${duration}s`}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-gray-400">{statusMessage}</p>
                </div>
              </div>

              <div className="w-full max-w-md mx-auto">
                <AdSlot slot="ptcView" />
              </div>
            </div>
          )}

          {phase === 'captcha' && captcha && (
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 sm:p-10 max-w-md mx-auto">
              <div className="text-center space-y-5">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
                  <Shield className="w-7 h-7 text-cyan-400" strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Verify you are human</h3>
                  <p className="text-sm text-gray-400 mt-1">
                    Solve the quick math challenge to claim your reward instantly.
                  </p>
                </div>

                <div className="rounded-xl border border-gray-800 bg-gray-950 px-5 py-4">
                  <p className="font-mono text-3xl font-extrabold tracking-wider text-white">
                    {captcha.a} + {captcha.b} = ?
                  </p>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {captcha.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleCaptchaSelect(opt)}
                      className="rounded-lg border border-gray-700 bg-gray-800 hover:bg-cyan-500 hover:border-cyan-400 px-2 py-3 font-mono text-lg font-bold text-white transition-colors"
                    >
                      {opt}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  {captchaError ? (
                    <p className="text-xs font-semibold text-red-400">{captchaError}</p>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    onClick={handleRefreshCaptcha}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-white transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    New challenge
                  </button>
                </div>
              </div>
            </div>
          )}

          {phase === 'claiming' && (
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-10 text-center max-w-md mx-auto">
              <Loader2 className="w-10 h-10 mx-auto text-cyan-400 animate-spin mb-4" />
              <h3 className="text-lg font-bold text-white mb-1">Claiming your reward…</h3>
              <p className="text-sm text-gray-400">
                Transferring {fmtAmount(adInfo?.reward ?? 0)} {CURRENCY} to your FaucetPay account.
              </p>
            </div>
          )}

          {phase === 'success' && claimResult && (
            <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-cyan-500/10 p-6 sm:p-10 text-center max-w-md mx-auto">
              <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center mb-4">
                <CheckCircle2
                  className="w-9 h-9 text-emerald-400 animate-pulse"
                  strokeWidth={2.25}
                />
              </div>
              <h3 className="text-xl font-extrabold text-emerald-300 mb-1">Success!</h3>
              <p className="text-sm text-gray-300 mb-4">
                Reward sent to your FaucetPay account.
              </p>

              <div className="rounded-xl border border-emerald-500/30 bg-gray-950/60 px-5 py-4 space-y-2 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Amount</span>
                  <span className="font-extrabold text-emerald-400">
                    +{fmtAmount(claimResult.reward)} {CURRENCY}
                  </span>
                </div>
                {claimResult.txid && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">FaucetPay TX</span>
                    <span className="font-mono text-xs text-cyan-400 truncate ml-2 max-w-[200px]">
                      {claimResult.txid}
                    </span>
                  </div>
                )}
              </div>

              {claimResult.warning && (
                <p className="text-xs font-semibold text-amber-400 mb-4">
                  ⚠️ {claimResult.warning}
                </p>
              )}

              <p className="text-xs text-gray-500">
                Redirecting back to PTC ads in a moment…
              </p>
            </div>
          )}

          {(phase === 'error' || phase === 'closed') && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-center max-w-md mx-auto">
              <AlertTriangle className="w-10 h-10 mx-auto text-red-400 mb-3" />
              <p className="text-sm text-red-300 font-medium mb-4">
                {errorText || 'Session closed.'}
              </p>
              <button
                type="button"
                onClick={() => router.push('/ptc')}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 px-5 py-2 text-sm font-semibold text-white transition-colors"
              >
                Back to PTC Ads
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
