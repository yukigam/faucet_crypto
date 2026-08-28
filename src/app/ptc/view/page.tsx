'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import SidebarNav from '@/components/SidebarNav';
import AdSlot from '@/components/AdSlot';
import { useBannerClickDetection } from '@/hooks/useBannerClickDetection';

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
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [bannerClicked, setBannerClicked] = useState(false);
  const [registeringClick, setRegisteringClick] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [result, setResult] = useState<{ reward: number; balance: number; txid?: string; warning?: string } | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const verifyFiredRef = useRef(false);
  const bannerClickInFlightRef = useRef(false);
  const durationRef = useRef(30);

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
        setSecondsLeft(durationRef.current);
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
      } else {
        setErrorText(data.error || 'Verification failed. Try starting the ad again.');
        setPhase('error');
      }
    } catch {
      setErrorText('Network error while verifying — your session stays valid for 10 minutes.');
      setPhase('error');
    }
  }, []);

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

        setAdInfo(data);
        startedAtRef.current = Date.now();

        const duration = data.duration_seconds ?? 30;
        durationRef.current = duration;
        if (data.watch_started_at) {
          const elapsed = Math.floor(
            (Date.now() - new Date(data.watch_started_at).getTime()) / 1000,
          );
          setBannerClicked(true);
          setSecondsLeft(Math.max(0, duration - elapsed));
        } else {
          setBannerClicked(false);
          setSecondsLeft(duration);
        }
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

  // Countdown → auto-verify once (only runs after banner click)
  useEffect(() => {
    if (phase !== 'watching' || !bannerClicked || secondsLeft === null || !token) return;

    if (secondsLeft <= 0) {
      if (!verifyFiredRef.current) {
        verifyFiredRef.current = true;
        void verifyReward(token);
      }
      return;
    }
    const id = setTimeout(() => setSecondsLeft((s) => Math.max(0, (s ?? 0) - 1)), 1000);
    return () => clearTimeout(id);
  }, [phase, bannerClicked, secondsLeft, token, verifyReward]);

  // Auto-redirect back to the ads list if unverified past the grace window
  useEffect(() => {
    if (phase !== 'watching' || !startedAtRef.current) return;
    const id = setTimeout(
      () => window.location.assign('/ptc?msg=expired'),
      VERIFY_GRACE_MS - (Date.now() - startedAtRef.current),
    );
    return () => clearTimeout(id);
  }, [phase]);

  const duration = adInfo?.duration_seconds ?? 0;
  const progress = bannerClicked && secondsLeft !== null && duration > 0
    ? ((duration - secondsLeft) / duration) * 100
    : 0;
  const timerPaused = phase === 'watching' && !bannerClicked;

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

              <div className="flex items-center justify-between px-2">
                <span className="text-sm text-gray-600">
                  {phase === 'verifying'
                    ? 'Crediting reward…'
                    : timerPaused
                      ? 'Click the banner to start'
                      : 'Keep this page open'}
                </span>
                <span className={`font-mono font-bold text-2xl ${
                  timerPaused
                    ? 'text-amber-600'
                    : secondsLeft === 0
                      ? 'text-green-600'
                      : 'text-gray-900'
                }`}>
                  {phase === 'verifying'
                    ? '✓'
                    : timerPaused
                      ? '⏸'
                      : `${secondsLeft ?? 0}s`}
                </span>
              </div>
              <div className="h-2 w-full bg-blue-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                    timerPaused
                      ? 'bg-amber-400 w-0'
                      : 'bg-gradient-to-r from-cyan-500 to-green-500'
                  }`}
                  style={{ width: timerPaused ? '0%' : `${progress}%` }}
                />
              </div>

              {timerPaused && (
                <div className="border rounded-lg px-4 py-3 text-sm font-medium bg-amber-50 border-amber-200 text-amber-800">
                  {registeringClick
                    ? 'Registering banner click…'
                    : 'Click the Adsterra banner below to start the viewing timer. The full watch duration begins after your click.'}
                </div>
              )}

              {/* Adsterra banner — timer stays paused until user clicks it */}
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
