'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import SidebarNav from '@/components/SidebarNav';
import AdSlot from '@/components/AdSlot';
import { useBannerClickDetection } from '@/hooks/useBannerClickDetection';
import { usePtcWatchTimer } from '@/hooks/usePtcWatchTimer';

const CURRENCY = 'TON';
// Server rejects verification 10 minutes after the session starts
const VERIFY_GRACE_MS = 10 * 60 * 1000;

type Phase = 'loading' | 'watching' | 'verifying' | 'success' | 'error';

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

function fmtAmount(n: number): string {
  return n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function ViewAd() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [phase, setPhase] = useState<Phase>('loading');
  const [adInfo, setAdInfo] = useState<AdStatus | null>(null);
  const [bannerClicked, setBannerClicked] = useState(false);
  const [activeSeconds, setActiveSeconds] = useState(0);
  const [registeringClick, setRegisteringClick] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [result, setResult] = useState<{ reward: number; balance: number; txid?: string; warning?: string } | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const verifyFiredRef = useRef(false);
  const bannerClickInFlightRef = useRef(false);
  const durationRef = useRef(30);
  const activeSecondsRef = useRef(0);

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

  const verifyReward = useCallback(async (t: string) => {
    setPhase('verifying');
    try {
      const res = await fetch('/api/ptc/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: t }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setResult({ reward: data.reward, balance: data.balance, txid: data.txid, warning: data.warning });
        setPhase('success');
      } else if (data.code === 'already_claimed') {
        setErrorText('This ad view was already credited.');
        setPhase('error');
      } else if (data.code === 'session_expired') {
        setErrorText('View session expired — start the ad again from the PTC Ads list.');
        setPhase('error');
      } else if (data.code === 'banner_not_clicked') {
        verifyFiredRef.current = false;
        setErrorText('Click the Adsterra banner ad to start the timer.');
        setBannerClicked(false);
        setPhase('watching');
      } else if (data.code === 'timer_not_finished') {
        verifyFiredRef.current = false;
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
  }, [resetCompletion, syncRemaining]);

  useEffect(() => {
    onWatchCompleteRef.current = () => {
      if (!token || verifyFiredRef.current) return;
      verifyFiredRef.current = true;
      void verifyReward(token);
    };
  }, [token, verifyReward]);

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
        // Keep the seconds already accrued this session (synced from the
        // server on load) instead of resetting the countdown. If the watch
        // had already reached full duration before a reload, credit the
        // reward right away — no further counting is needed.
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

  // Load ad info for this token
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/ptc/status?token=${encodeURIComponent(token)}`);
        const data: AdStatus = await res.json();
        if (cancelled) return;

        if (!data.success) {
          setErrorText(data.error === 'invalid_token' ? 'Invalid or unknown ad view session.' : 'Failed to load ad.');
          setPhase('error');
          return;
        }
        if (data.status === 'completed') {
          setErrorText('Reward already credited for this session — pick another ad from the list.');
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

        // Every fresh page load — including a reload — starts paused behind
        // the banner gate. Never resume counting just because the server
        // already has watch_started_at from before the reload; ptc_banner_click
        // is idempotent, so re-clicking keeps the original watch start time
        // while the accrued active_watch_seconds are preserved as progress.
        setBannerClicked(false);
        setPhase('watching');
      } catch {
        if (!cancelled) {
          setErrorText('Network error loading ad details.');
          setPhase('error');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [token]);

  // Auto-redirect back to the ads list if unverified past the grace window
  useEffect(() => {
    if (phase !== 'watching' || !startedAtRef.current) return;
    const id = setTimeout(
      () => window.location.assign('/ptc?msg=expired'),
      VERIFY_GRACE_MS - (Date.now() - startedAtRef.current),
    );
    return () => clearTimeout(id);
  }, [phase]);

  const statusChip =
    phase === 'verifying'
      ? '✓ Verifying'
      : registeringClick
        ? '⏳ Registering click…'
        : pauseReason === 'banner'
          ? '⏸ Paused — waiting for your click'
          : pauseReason === 'focus'
            ? '⏸ Paused — you left this page'
            : '▶ Watching';

  const statusHint =
    phase === 'verifying'
      ? 'Crediting your reward…'
      : registeringClick
        ? 'Registering your banner click…'
        : pauseReason === 'banner'
          ? '👆 Click the Adsterra banner below — the timer only counts after your click.'
          : pauseReason === 'focus'
            ? 'Switch back to this tab to keep the timer running.'
            : 'Keep this tab open and visible until the timer reaches 0.';

  return (
    <main className="min-h-screen flex flex-col items-center p-6 gap-6 md:pl-64">
      <SidebarNav />

      <div className="w-full max-w-md mx-auto overflow-hidden p-6 rounded-2xl bg-gradient-to-br from-cyan-400 via-blue-400 to-indigo-500 shadow-xl">
        <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 space-y-4">
          <h1 className="text-lg font-bold text-center text-gray-900">📺 Watching Ad</h1>

          {phase === 'loading' && (
            <p className="text-sm text-gray-500 text-center animate-pulse">Loading ad…</p>
          )}

          {(phase === 'watching' || phase === 'verifying') && adInfo && (
            <>
              <p className="text-sm text-gray-700 text-center font-medium">{adInfo.title}</p>

              {/* Unmissable step-by-step instructions */}
              <div className="rounded-xl bg-gray-900 px-4 py-3 shadow-inner">
                <p className="text-center text-[11px] font-extrabold uppercase tracking-widest text-amber-400">
                  📢 How to earn — 3 steps
                </p>
                <ul className="mt-2 space-y-1.5 text-[13px] font-bold leading-snug text-white">
                  <li className={`flex items-center gap-2 ${bannerClicked ? 'text-emerald-400' : 'animate-pulse text-amber-300'}`}>
                    <span aria-hidden>{bannerClicked ? '✅' : '👆'}</span>
                    <span>Step 1: Click the Adsterra banner below</span>
                    {bannerClicked && (
                      <span className="ml-auto rounded bg-emerald-500 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-white">
                        Done
                      </span>
                    )}
                  </li>
                  <li className={`flex items-center gap-2 ${!isPaused ? 'text-cyan-300' : 'text-gray-400'}`}>
                    <span aria-hidden>{!isPaused ? '👀' : '⏸️'}</span>
                    <span>Step 2: Stay on this page until the timer finishes</span>
                  </li>
                  <li className="flex items-center gap-2 text-emerald-400">
                    <span aria-hidden>💰</span>
                    <span>→ Earn reward</span>
                  </li>
                </ul>
              </div>

              <iframe
                title={adInfo.title || 'Advertisement'}
                src={adInfo.target_url}
                scrolling="auto"
                sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                style={{
                  border: 1,
                  width: '100%',
                  height: 320,
                  borderRadius: 12,
                  display: 'block',
                  backgroundColor: '#f3f4f6',
                }}
              />

              <a
                href={adInfo.target_url}
                target="_blank"
                rel="noopener nofollow sponsored"
                className="block text-xs text-blue-600 hover:underline text-center"
              >
                Ad not showing? Open it in a new tab instead ↗
              </a>

              <div className="text-center bg-cyan-50 border border-cyan-200 rounded-lg py-2 px-4">
                <p className="text-xs text-cyan-700 font-medium">
                  Reward on completion: <span className="font-bold">{fmtAmount(adInfo.reward ?? 0)} {CURRENCY}</span>
                </p>
              </div>

              {/* Live status panel — big, unmissable paused/active feedback */}
              <div className={`rounded-xl border-2 px-4 py-3 text-center ${
                phase === 'verifying'
                  ? 'border-emerald-300 bg-emerald-50'
                  : pauseReason === 'banner'
                    ? 'border-amber-300 bg-amber-50'
                    : pauseReason === 'focus'
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-emerald-300 bg-emerald-50'
              }`}>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-widest text-white ${
                  phase === 'verifying'
                    ? 'bg-emerald-500'
                    : pauseReason === 'banner'
                      ? 'bg-amber-500'
                      : pauseReason === 'focus'
                        ? 'bg-blue-500'
                        : 'animate-pulse bg-emerald-500'
                }`}>
                  {statusChip}
                </span>
                <p className={`mt-1.5 font-mono text-4xl font-extrabold ${
                  phase === 'verifying'
                    ? 'text-emerald-600'
                    : isPaused
                      ? 'text-amber-600'
                      : secondsLeft === 0
                        ? 'text-emerald-600'
                        : 'text-gray-900'
                }`}>
                  {phase === 'verifying'
                    ? '✓'
                    : isPaused
                      ? '⏸'
                      : `${secondsLeft}s`}
                </p>
                <p className="mt-1 text-xs font-semibold text-gray-700">{statusHint}</p>
              </div>

              <div className="h-2 w-full bg-blue-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                    isPaused
                      ? 'bg-amber-400'
                      : 'bg-gradient-to-r from-cyan-500 to-green-500'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>

              <AdSlot slot="ptcView" trackPtcBanner />
            </>
          )}

          {phase === 'success' && result && (
            <div className="space-y-4 text-center">
              <div className="text-5xl">🎉</div>
              <p className="text-base font-bold text-green-700">
                +{fmtAmount(result.reward)} {CURRENCY} credited!
              </p>
              <p className="text-sm text-gray-600">New balance: {fmtAmount(result.balance)} {CURRENCY}</p>
              {result.txid && (
                <p className="text-xs text-green-600 font-medium">
                  ✓ Paid to your FaucetPay account (tx: {result.txid})
                </p>
              )}
              {result.warning && (
                <p className="text-xs text-amber-600 font-medium">⚠️ {result.warning}</p>
              )}
              <AdSlot slot="ptcView" />
              <Link
                href="/ptc"
                className="block w-full py-2.5 rounded-lg font-semibold text-sm bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:opacity-90 transition-opacity"
              >
                Back to PTC Ads
              </Link>
            </div>
          )}

          {phase === 'error' && (
            <div className="space-y-4 text-center">
              <div className="text-4xl">⚠️</div>
              <p className="text-sm text-red-700">{errorText}</p>
              <Link
                href="/ptc"
                className="block w-full py-2.5 rounded-lg font-semibold text-sm bg-gray-800 text-white hover:opacity-90 transition-opacity"
              >
                Back to PTC Ads
              </Link>
            </div>
          )}
        </div>
      </div>

      {phase === 'watching' && (
        <AdSlot slot="ptcView" trackPtcBanner className="w-full max-w-md" />
      )}
      {phase !== 'watching' && (
        <AdSlot slot="ptcView" className="w-full max-w-md" />
      )}
    </main>
  );
}

export default function PtcViewPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center p-6">
        <p className="text-gray-500 text-sm animate-pulse">Loading ad viewer…</p>
      </main>
    }>
      <ViewAd />
    </Suspense>
  );
}
