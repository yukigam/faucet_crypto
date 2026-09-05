'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import SidebarNav from '@/components/SidebarNav';
import AdSlot from '@/components/AdSlot';
import MathCaptcha from '@/components/MathCaptcha';
import { usePtcWatchTimer } from '@/hooks/usePtcWatchTimer';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  ShieldQuestion,
  Timer,
  Trophy,
} from 'lucide-react';

const CURRENCY = 'TON';
// Fixed reward — every completed PTC ad pays exactly this amount. Displayed
// in the top bar and shown on the captcha / success screens.
const PTC_REWARD = 0.00003;
const VERIFY_GRACE_MS = 10 * 60 * 1000;
const SUCCESS_REDIRECT_MS = 3000;

type Phase = 'loading' | 'watching' | 'captcha' | 'verifying' | 'success' | 'error';

type AdStatus = {
  success: boolean;
  title?: string;
  duration_seconds?: number;
  reward?: number;
  status?: 'pending' | 'completed';
  active_watch_seconds?: number;
  ad_active?: boolean;
  error?: string;
};

function fmtAmount(n: number): string {
  return n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function ViewAd() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [phase, setPhase] = useState<Phase>('loading');
  const [adInfo, setAdInfo] = useState<AdStatus | null>(null);
  const [errorText, setErrorText] = useState('');
  const [result, setResult] = useState<{
    reward: number;
    balance: number;
    txid?: string;
    warning?: string;
  } | null>(null);
  const verifyFiredRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);

  const duration = adInfo?.duration_seconds ?? 0;

  const onWatchCompleteRef = useRef<() => void>(() => {});

  const {
    secondsLeft,
    isPaused,
    resetCompletion,
    syncRemaining,
  } = usePtcWatchTimer({
    token,
    duration,
    enabled: phase === 'watching',
    initialActiveSeconds: adInfo?.active_watch_seconds ?? 0,
    onComplete: () => onWatchCompleteRef.current(),
  });

  // Rewards are verified server-side and pushed straight to FaucetPay. Called
  // only after the user passes the math-captcha gate; a failed payout never
  // rolls the DB credit back and is surfaced as a warning instead.
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
        } else if (data.code === 'timer_not_finished') {
          // Rare race: verify ran before the final tick landed server-side.
          verifyFiredRef.current = false;
          resetCompletion();
          const elapsed = typeof data.elapsed === 'number' ? data.elapsed : 0;
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

  // When the watch timer hits 0 we open the captcha gate instead of verifying
  // immediately; solving it then fires the real verify call which pays out.
  useEffect(() => {
    onWatchCompleteRef.current = () => {
      if (!token || verifyFiredRef.current) return;
      verifyFiredRef.current = true;
      setPhase('captcha');
    };
  }, [token]);

  const onCaptchaSolved = useCallback(() => {
    if (!token || phase !== 'captcha') return;
    void verifyReward(token);
  }, [token, phase, verifyReward]);

  // Load the view session — the token from /ptc/view?token=... is the single
  // source of truth for ad details and accumulated watch time.
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
        if (data.ad_active === false) {
          setErrorText('This ad is no longer available.');
          setPhase('error');
          return;
        }

        setAdInfo(data);
        startedAtRef.current = Date.now();
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

  // Safety net: sessions must be verified within 10 minutes of starting.
  useEffect(() => {
    if (phase !== 'watching' || !startedAtRef.current) return;
    const id = setTimeout(
      () => router.push('/ptc'),
      VERIFY_GRACE_MS - (Date.now() - startedAtRef.current),
    );
    return () => clearTimeout(id);
  }, [phase, router]);

  // Show success, then send the user back to the ad list.
  useEffect(() => {
    if (phase !== 'success') return;
    const id = setTimeout(() => router.push('/ptc'), SUCCESS_REDIRECT_MS);
    return () => clearTimeout(id);
  }, [phase, router]);

  return (
    <>
      {(phase === 'watching' || phase === 'captcha') && (
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-gray-800 bg-gray-950/85 px-4 py-3 backdrop-blur-md sm:px-6 md:ml-64">
          <span className="min-w-0 truncate text-sm font-semibold text-gray-300">
            {adInfo?.title ?? 'PTC Ad'}
          </span>

          {phase === 'watching' ? (
            <div
              className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-1.5 ${
                isPaused
                  ? 'border-amber-500/50 bg-amber-500/10'
                  : 'border-cyan-500/50 bg-cyan-500/10'
              }`}
            >
              <Timer
                className={`w-4 h-4 ${isPaused ? 'text-amber-400' : 'text-cyan-400'}`}
              />
              <span
                className={`font-mono text-lg font-black tabular-nums ${
                  isPaused ? 'text-amber-400' : 'text-white'
                }`}
              >
                {secondsLeft}
              </span>
              <span
                className={`text-[11px] font-semibold uppercase ${
                  isPaused ? 'text-amber-400/80' : 'text-cyan-300/80'
                }`}
              >
                seconds
              </span>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-2 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-4 py-1.5">
              <ShieldQuestion className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-bold text-emerald-300">
                Verification required
              </span>
            </div>
          )}
        </header>
      )}

      <main className="min-h-screen flex flex-col items-center p-6 gap-6 md:pl-64 pt-8">
        <SidebarNav />

      <div className="w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-900 p-5 sm:p-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-bold text-white truncate">
            {phase === 'loading' ? 'Loading ad…' : adInfo?.title ?? 'PTC Ad'}
          </h1>
          {adInfo && phase !== 'loading' && (
            <div className="shrink-0 text-right">
              <p className="text-sm font-extrabold text-green-400">
                +{fmtAmount(PTC_REWARD)} {CURRENCY}
              </p>
              <p className="text-[11px] text-gray-500">Watch time: {duration}s</p>
            </div>
          )}
        </div>

        {phase === 'loading' && (
          <div className="py-10 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
            <p className="text-sm text-gray-400">Preparing your ad view…</p>
          </div>
        )}

        {phase === 'watching' && (
          <>
            {/* Prominent Adsterra display banner — the primary impression for
                this view session, shown full-width and centered. */}
            <div className="w-full flex justify-center">
              <AdSlot slot="ptcView" className="w-full max-w-[300px]" />
            </div>

            <div
              className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold ${
                isPaused
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                  : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
              }`}
            >
              {isPaused ? (
                <>
                  <EyeOff className="w-4 h-4" />
                  Timer paused — return to this tab to resume
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4" />
                  Watching ad — keep this tab open and focused
                </>
              )}
            </div>

            <p className="text-center text-xs text-gray-500">
              The countdown in the top bar only runs while this tab is visible
              and focused — switching tabs or minimizing pauses it instantly.
            </p>
          </>
        )}

        {phase === 'verifying' && (
          <div className="py-8 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            <p className="text-sm font-bold text-emerald-400">
              Validating your view & sending the reward to FaucetPay…
            </p>
          </div>
        )}

        {phase === 'success' && result && (
          <div className="space-y-4 text-center py-2">
            <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/15 border-2 border-emerald-500/60 flex items-center justify-center">
              <CheckCircle2
                className="w-9 h-9 text-emerald-400 animate-pulse"
                strokeWidth={2.25}
              />
            </div>
            <h2 className="text-xl font-extrabold text-emerald-300 flex items-center justify-center gap-2">
              <Trophy className="w-5 h-5" />
              Success!
            </h2>
            <p className="text-sm text-gray-300">
              Reward paid instantly to your FaucetPay account.
            </p>
            <div className="rounded-xl border border-emerald-500/30 bg-gray-950/60 px-5 py-4 space-y-2 text-left">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Earned</span>
                <span className="font-extrabold text-emerald-400">
                  +{fmtAmount(result.reward)} {CURRENCY}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Balance</span>
                <span className="font-mono font-bold text-gray-200">
                  {fmtAmount(result.balance)} {CURRENCY}
                </span>
              </div>
              {result.txid && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">FaucetPay TX</span>
                  <span className="font-mono text-xs text-cyan-400 truncate ml-2 max-w-[200px]">
                    {result.txid}
                  </span>
                </div>
              )}
            </div>
            {result.warning && (
              <p className="text-xs font-semibold text-amber-400">
                ⚠️ {result.warning}
              </p>
            )}
            <p className="text-xs text-gray-500">
              Redirecting back to PTC ads in a moment…
            </p>
          </div>
        )}

        {phase === 'error' && (
          <div className="space-y-4 text-center py-4">
            <div className="flex justify-center">
              <AlertTriangle className="w-10 h-10 text-red-400" />
            </div>
            <p className="text-sm font-bold text-red-300">{errorText}</p>
            <Link
              href="/ptc"
              className="block w-full py-2.5 rounded-lg font-bold text-sm bg-gray-800 text-white hover:opacity-90 transition-opacity"
            >
              Back to PTC Ads
            </Link>
          </div>
        )}
      </div>

      <Link
        href="/ptc"
        className="text-xs text-gray-500 hover:text-white transition-colors"
      >
        ← Back to PTC Ads
      </Link>

      {phase === 'captcha' && (
        <MathCaptcha
          reward={PTC_REWARD}
          currency={CURRENCY}
          onSolve={onCaptchaSolved}
        />
      )}
    </main>
    </>
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
