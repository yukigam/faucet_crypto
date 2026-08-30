'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SidebarNav from '@/components/SidebarNav';
import AdSlot from '@/components/AdSlot';
import { useBannerClickDetection } from '@/hooks/useBannerClickDetection';
import { usePtcWatchTimer } from '@/hooks/usePtcWatchTimer';
import {
  X,
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
  Timer,
  ExternalLink,
} from 'lucide-react';

const CURRENCY = 'TON';
const VERIFY_GRACE_MS = 10 * 60 * 1000;

type Phase = 'loading' | 'watching' | 'captcha' | 'verifying' | 'success' | 'error';

type AdStatus = {
  success: boolean;
  title?: string;
  target_url?: string;
  duration_seconds?: number;
  reward?: number;
  status?: 'pending' | 'completed';
  watch_started_at?: string | null;
  active_watch_seconds?: number;
  error?: string;
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

function ViewAd() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [phase, setPhase] = useState<Phase>('loading');
  const [adInfo, setAdInfo] = useState<AdStatus | null>(null);
  const [bannerClicked, setBannerClicked] = useState(false);
  const [registeringClick, setRegisteringClick] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [tabActive, setTabActive] = useState(true);
  const [result, setResult] = useState<{
    reward: number;
    balance: number;
    txid?: string;
    warning?: string;
  } | null>(null);
  const [activeSeconds, setActiveSeconds] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const verifyFiredRef = useRef(false);
  const bannerClickInFlightRef = useRef(false);
  const durationRef = useRef(30);
  const activeSecondsRef = useRef(0);

  const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null);
  const [captchaError, setCaptchaError] = useState('');

  const duration = adInfo?.duration_seconds ?? 0;

  const onWatchCompleteRef = useRef<() => void>(() => {});

  const {
    secondsLeft,
    pauseReason,
    isPaused,
    progress,
    resetCompletion,
    syncRemaining,
  } = usePtcWatchTimer({
    token,
    duration,
    bannerClicked,
    enabled: phase === 'watching',
    initialActiveSeconds: activeSeconds,
    onComplete: () => onWatchCompleteRef.current(),
  });

  const verifyReward = useCallback(
    async (t: string) => {
      setPhase('verifying');
      try {
        const res = await fetch('/api/ptc/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: t }),
        });
        const data = await res.json();

        if (res.ok && data.success) {
          setResult({
            reward: data.reward,
            balance: data.balance,
            txid: data.txid,
            warning: data.warning,
          });
          setPhase('success');
        } else if (data.code === 'already_claimed') {
          setErrorText('This ad view was already credited.');
          setPhase('error');
        } else if (data.code === 'session_expired') {
          setErrorText('View session expired — start the ad again from the PTC Ads list.');
          setPhase('error');
        } else if (data.code === 'banner_not_clicked') {
          verifyFiredRef.current = false;
          setCaptcha(null);
          setCaptchaError('');
          setErrorText('Click the Adsterra banner ad to start the timer.');
          setBannerClicked(false);
          setPhase('watching');
        } else if (data.code === 'timer_not_finished') {
          verifyFiredRef.current = false;
          setCaptcha(null);
          setCaptchaError('');
          resetCompletion();
          const elapsed = typeof data.elapsed === 'number' ? data.elapsed : 0;
          activeSecondsRef.current = elapsed;
          setActiveSeconds(elapsed);
          syncRemaining(elapsed);
          setPhase('watching');
        } else {
          setErrorText(data.error || 'Verification failed. Try starting the ad again.');
          setPhase('error');
        }
      } catch {
        setErrorText('Network error while verifying — your session stays valid for 10 minutes.');
        setPhase('error');
      }
    },
    [resetCompletion, syncRemaining],
  );

  useEffect(() => {
    onWatchCompleteRef.current = () => {
      if (!token || verifyFiredRef.current) return;
      setCaptcha(generateCaptcha());
      setCaptchaError('');
      setPhase('captcha');
    };
  }, [token]);

  const registerBannerClick = useCallback(async (t: string) => {
    if (bannerClickInFlightRef.current || bannerClicked) return;
    bannerClickInFlightRef.current = true;
    setRegisteringClick(true);
    try {
      const res = await fetch('/api/ptc/banner-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBannerClicked(true);
        if (durationRef.current - activeSecondsRef.current <= 0) {
          onWatchCompleteRef.current();
        }
      } else {
        setErrorText(data.error || 'Failed to register banner click.');
        setPhase('error');
      }
    } catch {
      setErrorText('Network error while registering banner click.');
      setPhase('error');
    } finally {
      setRegisteringClick(false);
      bannerClickInFlightRef.current = false;
    }
  }, [bannerClicked]);

  const handleBannerDetected = useCallback(() => {
    if (!token || bannerClicked || phase !== 'watching') return;
    void registerBannerClick(token);
  }, [token, bannerClicked, phase, registerBannerClick]);

  useBannerClickDetection(phase === 'watching' && !bannerClicked, handleBannerDetected);

  useEffect(() => {
    if (phase !== 'watching') return;
    const handle = () => {
      const active = document.visibilityState === 'visible' && document.hasFocus();
      setTabActive(active);
    };
    document.addEventListener('visibilitychange', handle);
    window.addEventListener('blur', handle);
    window.addEventListener('focus', handle);
    handle();
    return () => {
      document.removeEventListener('visibilitychange', handle);
      window.removeEventListener('blur', handle);
      window.removeEventListener('focus', handle);
    };
  }, [phase]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/ptc/status?token=${encodeURIComponent(token)}`);
        const data: AdStatus = await res.json();
        if (cancelled) return;

        if (!data.success) {
          setErrorText(
            data.error === 'invalid_token'
              ? 'Invalid or unknown ad view session.'
              : 'Failed to load ad.',
          );
          setPhase('error');
          return;
        }
        if (data.status === 'completed') {
          setErrorText(
            'Reward already credited for this session — pick another ad from the list.',
          );
          setPhase('error');
          return;
        }

        const adDuration = data.duration_seconds ?? 30;
        const watched = data.active_watch_seconds ?? 0;

        setAdInfo(data);
        startedAtRef.current = Date.now();
        durationRef.current = adDuration;
        activeSecondsRef.current = watched;
        setActiveSeconds(watched);
        setBannerClicked(false);
        setPhase('watching');
      } catch {
        if (!cancelled) {
          setErrorText('Network error loading ad details.');
          setPhase('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (phase !== 'watching' || !startedAtRef.current) return;
    const id = setTimeout(
      () => window.location.assign('/ptc?msg=expired'),
      VERIFY_GRACE_MS - (Date.now() - startedAtRef.current),
    );
    return () => clearTimeout(id);
  }, [phase]);

  const handleCaptchaSelect = useCallback(
    (choice: number) => {
      if (!captcha || phase !== 'captcha' || !token || verifyFiredRef.current) return;
      setCaptchaError('');
      if (choice === captcha.answer) {
        verifyFiredRef.current = true;
        void verifyReward(token);
      } else {
        setCaptchaError('Wrong answer! Try a new challenge.');
        setCaptcha(generateCaptcha());
      }
    },
    [captcha, phase, token, verifyReward],
  );

  const handleRefreshCaptcha = useCallback(() => {
    setCaptchaError('');
    setCaptcha(generateCaptcha());
  }, []);

  const openTargetUrl = useCallback(() => {
    if (!adInfo?.target_url) return;
    window.open(adInfo.target_url, '_blank', 'noopener,noreferrer');
  }, [adInfo]);

  const statusChip = useMemo(() => {
    if (phase === 'verifying') return '✓ Verifying';
    if (registeringClick) return '⏳ Registering click…';
    if (pauseReason === 'banner') return '⏸ Waiting for click';
    if (pauseReason === 'focus') return '⏸ Paused — stay on tab';
    return '▶ Watching';
  }, [phase, registeringClick, pauseReason]);

  return (
    <main className="min-h-screen flex flex-col items-center p-6 gap-6 md:pl-64">
      <SidebarNav />

      <div className="w-full max-w-lg mx-auto overflow-hidden p-6 rounded-2xl bg-gradient-to-br from-cyan-400 via-blue-400 to-indigo-500 shadow-xl">
        <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-center flex-1 text-gray-900">
              📺 Paid-to-Click View
            </h1>
            <Link
              href="/ptc"
              aria-label="Close / Exit"
              className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-gray-100 hover:bg-red-500/80 border border-gray-200 hover:border-red-500/60 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2.25} />
              Exit
            </Link>
          </div>

          {phase === 'loading' && (
            <div className="flex flex-col items-center py-10 text-gray-500">
              <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mb-3" />
              <p className="text-sm animate-pulse">Loading ad…</p>
            </div>
          )}

          {(phase === 'watching' || phase === 'verifying') && adInfo && (
            <>
              <p className="text-sm font-bold text-gray-900 text-center leading-tight">
                {adInfo.title}
              </p>

              {phase === 'watching' && pauseReason === 'focus' && (
                <div className="rounded-xl border-2 border-amber-400/80 bg-amber-500/10 px-4 py-2.5">
                  <div className="flex items-center justify-center gap-2 text-amber-800">
                    <EyeOff className="w-4 h-4" strokeWidth={2.25} />
                    <p className="text-sm font-extrabold text-center">
                      Timer paused! Please stay on this tab — switch back to resume.
                    </p>
                  </div>
                </div>
              )}

              {phase === 'watching' && pauseReason === 'banner' && (
                <div className="rounded-xl border-2 border-violet-400/70 bg-violet-500/10 px-4 py-2.5">
                  <div className="flex items-center justify-center gap-2 text-violet-900">
                    <Play
                      className="w-4 h-4 text-violet-600 animate-pulse"
                      strokeWidth={2.25}
                    />
                    <p className="text-sm font-extrabold text-center">
                      👆 Click the Adsterra banner below to start the countdown timer
                    </p>
                  </div>
                </div>
              )}

              {phase === 'watching' && !isPaused && tabActive && (
                <div className="rounded-xl border-2 border-emerald-400/60 bg-emerald-500/10 px-4 py-2.5">
                  <div className="flex items-center justify-center gap-2 text-emerald-800">
                    <Eye className="w-4 h-4 text-emerald-700" strokeWidth={2.25} />
                    <p className="text-xs font-extrabold">
                      Watching now · Reward:{' '}
                      <span className="text-emerald-700">
                        {fmtAmount(adInfo.reward ?? 0)} {CURRENCY}
                      </span>
                    </p>
                  </div>
                </div>
              )}

              {/* --- Banner + Timer side-by-side --- */}
              <div className="rounded-2xl border-2 border-gray-200 bg-white shadow-inner overflow-hidden">
                <div
                  className={`flex items-stretch transition-colors duration-300 ${
                    !bannerClicked
                      ? 'bg-violet-500/5'
                      : isPaused
                        ? 'bg-amber-500/5'
                        : 'bg-emerald-500/5'
                  }`}
                >
                  {/* Left: Banner ad (centered, prominent) */}
                  <div className="flex-1 p-4 sm:p-5 flex flex-col items-center justify-center gap-2 border-r border-gray-200">
                    <div className="flex w-full items-center justify-between">
                      <p
                        className={`text-[11px] font-extrabold uppercase tracking-widest ${
                          !bannerClicked
                            ? 'text-violet-700 animate-pulse'
                            : 'text-emerald-700'
                        }`}
                      >
                        {!bannerClicked ? '▼ Click ad ▼' : '✓ Viewing ad'}
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
                    <div className="w-full flex items-center justify-center">
                      <div className="w-full max-w-[260px]">
                        <AdSlot slot="ptcView" trackPtcBanner />
                      </div>
                    </div>
                    {adInfo.target_url && (
                      <button
                        type="button"
                        onClick={openTargetUrl}
                        className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-bold text-cyan-700 hover:text-cyan-900 hover:underline transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" strokeWidth={2.25} />
                        Open advertiser link in a new tab
                      </button>
                    )}
                  </div>

                  {/* Right: Live countdown timer, directly beside the banner */}
                  <div className="w-[140px] shrink-0 flex flex-col items-center justify-center gap-2 bg-gray-950 p-4">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-widest text-white ${
                        phase === 'verifying'
                          ? 'bg-emerald-500'
                          : registeringClick
                            ? 'bg-cyan-500'
                            : pauseReason === 'banner'
                              ? 'bg-violet-500 animate-pulse'
                              : pauseReason === 'focus'
                                ? 'bg-amber-500'
                                : 'bg-emerald-500 animate-pulse'
                      }`}
                    >
                      {phase === 'verifying' ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : pauseReason === 'banner' ? (
                        <MousePointerClick className="w-3 h-3" />
                      ) : pauseReason === 'focus' ? (
                        <EyeOff className="w-3 h-3" />
                      ) : (
                        <Timer className="w-3 h-3" />
                      )}
                      {statusChip}
                    </span>
                    <div
                      className={`font-mono text-5xl font-black tabular-nums tracking-tight ${
                        phase === 'verifying'
                          ? 'text-emerald-400'
                          : isPaused
                            ? 'text-amber-400'
                            : secondsLeft <= 5
                              ? 'text-rose-400 animate-pulse'
                              : 'text-white'
                      }`}
                    >
                      {phase === 'verifying'
                        ? '✓'
                        : isPaused
                          ? '⏸'
                          : `${secondsLeft}`}
                      {phase !== 'verifying' && !isPaused && (
                        <span className="text-xl text-gray-500 ml-0.5">s</span>
                      )}
                    </div>
                    <p className="text-[11px] font-bold text-center leading-tight text-gray-300">
                      {pauseReason === 'banner'
                        ? 'Click banner first'
                        : pauseReason === 'focus'
                          ? 'Come back to this tab'
                          : 'Keep watching'}
                    </p>
                    <div className="h-2 w-full bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
                          isPaused
                            ? 'bg-amber-400'
                            : 'bg-gradient-to-r from-cyan-400 to-emerald-400'
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-[11px] font-extrabold tracking-wide text-gray-400">
                      {progress.toFixed(0)}% complete
                    </p>
                  </div>
                </div>

                {/* Full-width progress under banner+timer */}
                <div className="h-2 w-full bg-gray-100">
                  <div
                    className={`h-full transition-[width] duration-1000 ease-linear ${
                      isPaused
                        ? 'bg-amber-500'
                        : 'bg-gradient-to-r from-cyan-500 to-emerald-500'
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div className="rounded-xl bg-gray-900 px-4 py-3">
                <p className="text-center text-[11px] font-extrabold uppercase tracking-widest text-amber-400">
                  📢 How to earn — 3 steps
                </p>
                <ul className="mt-2 space-y-1.5 text-[13px] font-bold leading-snug text-white">
                  <li
                    className={`flex items-center gap-2 ${
                      bannerClicked
                        ? 'text-emerald-400'
                        : 'animate-pulse text-amber-300'
                    }`}
                  >
                    <span aria-hidden>{bannerClicked ? '✅' : '👆'}</span>
                    <span>
                      Step 1: Click the Adsterra banner (target opens in a new tab)
                    </span>
                    {bannerClicked && (
                      <span className="ml-auto rounded bg-emerald-500 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-white">
                        Done
                      </span>
                    )}
                  </li>
                  <li
                    className={`flex items-center gap-2 ${
                      !isPaused ? 'text-cyan-300' : 'text-gray-400'
                    }`}
                  >
                    <span aria-hidden>{!isPaused ? '👀' : '⏸️'}</span>
                    <span>
                      Step 2: Stay on THIS tab (timer only counts when visible here)
                    </span>
                  </li>
                  <li className="flex items-center gap-2 text-emerald-400">
                    <span aria-hidden>💰</span>
                    <span>Step 3: Solve captcha → Instant FaucetPay payout</span>
                  </li>
                </ul>
              </div>

              <div className="text-center bg-cyan-50 border-2 border-cyan-200 rounded-lg py-2.5 px-4">
                <p className="text-sm text-cyan-800 font-bold">
                  Reward:{' '}
                  <span className="text-base font-extrabold text-emerald-700">
                    +{fmtAmount(adInfo.reward ?? 0)} {CURRENCY}
                  </span>
                  {' · '}
                  Watch time:{' '}
                  <span className="font-extrabold text-cyan-700">{duration}s</span>
                </p>
              </div>

              <AdSlot slot="ptcView" className="w-full max-w-md mx-auto" />
            </>
          )}

          {phase === 'captcha' && captcha && (
            <div className="space-y-5 text-center py-2">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center">
                <Shield className="w-7 h-7 text-cyan-600" strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-gray-900">
                  Timer complete — verify to claim
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Solve the quick math challenge — reward sent right after.
                </p>
              </div>
              <div className="rounded-xl border-2 border-gray-200 bg-gray-50 px-5 py-5">
                <p className="font-mono text-4xl font-black tracking-wider text-gray-900">
                  {captcha.a} + {captcha.b} = ?
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {captcha.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleCaptchaSelect(opt)}
                    className="rounded-lg border-2 border-gray-300 bg-white hover:bg-cyan-500 hover:border-cyan-400 hover:text-white px-2 py-3.5 font-mono text-xl font-black text-gray-800 transition-colors"
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between">
                {captchaError ? (
                  <p className="text-xs font-extrabold text-red-600">{captchaError}</p>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={handleRefreshCaptcha}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  New challenge
                </button>
              </div>
            </div>
          )}

          {phase === 'success' && result && (
            <div className="space-y-4 text-center py-2">
              <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/15 border-2 border-emerald-500/60 flex items-center justify-center">
                <CheckCircle2
                  className="w-9 h-9 text-emerald-600 animate-pulse"
                  strokeWidth={2.25}
                />
              </div>
              <h3 className="text-xl font-extrabold text-emerald-700 flex items-center justify-center gap-2">
                <Trophy className="w-5 h-5" />
                Success!
              </h3>
              <p className="text-sm font-bold text-gray-800">
                Reward paid instantly to your FaucetPay account.
              </p>
              <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 px-5 py-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 font-medium">Earned</span>
                  <span className="font-extrabold text-emerald-700 text-base">
                    +{fmtAmount(result.reward)} {CURRENCY}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 font-medium">Balance</span>
                  <span className="font-mono font-bold text-gray-900">
                    {fmtAmount(result.balance)} {CURRENCY}
                  </span>
                </div>
                {result.txid && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 font-medium">FaucetPay TX</span>
                    <span className="font-mono text-[11px] text-cyan-700 font-bold truncate ml-2 max-w-[180px]">
                      {result.txid}
                    </span>
                  </div>
                )}
              </div>
              {result.warning && (
                <p className="text-xs font-extrabold text-amber-700">
                  ⚠️ {result.warning}
                </p>
              )}
              <AdSlot slot="ptcView" />
              <Link
                href="/ptc"
                className="block w-full py-2.5 rounded-lg font-bold text-sm bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:opacity-90 transition-opacity"
              >
                Back to PTC Ads
              </Link>
            </div>
          )}

          {phase === 'verifying' && (
            <div className="py-6 flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
              <p className="text-sm font-bold text-emerald-700">
                Sending reward to FaucetPay…
              </p>
            </div>
          )}

          {phase === 'error' && (
            <div className="space-y-4 text-center py-4">
              <div className="flex justify-center">
                <AlertTriangle className="w-10 h-10 text-red-500" />
              </div>
              <p className="text-sm font-bold text-red-700">{errorText}</p>
              <Link
                href="/ptc"
                className="block w-full py-2.5 rounded-lg font-bold text-sm bg-gray-800 text-white hover:opacity-90 transition-opacity"
              >
                Back to PTC Ads
              </Link>
            </div>
          )}
        </div>
      </div>

      {phase === 'watching' && (
        <AdSlot slot="ptcView" trackPtcBanner className="w-full max-w-lg" />
      )}
      {phase !== 'watching' && (
        <AdSlot slot="ptcView" className="w-full max-w-lg" />
      )}
    </main>
  );
}

export default function PtcViewPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center p-6">
          <p className="text-gray-500 text-sm animate-pulse">Loading ad viewer…</p>
        </main>
      }
    >
      <ViewAd />
    </Suspense>
  );
}
