'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import AdBanner from './AdBanner';
import AdSlot from './AdSlot';
import { useAdBlock } from '@/contexts/AdBlockContext';
import { usePopunder, AD_VIEW_SECONDS } from '@/contexts/PopunderContext';

const REWARD = '0.000002';
const CURRENCY = 'TON';
const COOLDOWN_MS = 60_000;
const AD_LOAD_TIMEOUT_MS = 6_000;
// Turnstile site keys are public by design (they identify the widget — only
// the secret key must stay private). The inline fallback guarantees the widget
// always renders even if NEXT_PUBLIC_TURNSTILE_SITE_KEY wasn't baked into this
// build; the env var takes precedence when present.
const FALLBACK_TURNSTILE_SITE_KEY = '0x4AAAAAAD5kW6zX8NLmEIT1';
const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || FALLBACK_TURNSTILE_SITE_KEY;

type MessageType = 'success' | 'error' | 'info';

export default function FaucetClaim({ address }: { address: string }) {
  const { detected: adBlockDetected, checking: adBlockChecking } = useAdBlock();
  const {
    verified: popunderVerified,
    checking: popunderChecking,
    blocked: popunderBlocked,
    closedEarly: popunderClosedEarly,
    secondsRemaining: adSecondsRemaining,
  } = usePopunder();
  const turnstileRef = useRef<TurnstileInstance>(null);
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<MessageType>('info');
  const [balance, setBalance] = useState<number | null>(null);
  const [dailyClaims, setDailyClaims] = useState<number | undefined>(undefined);
  const [dailyLimit, setDailyLimit] = useState<number>(1);
  const [bonusClaims, setBonusClaims] = useState<number>(0);
  const [effectiveLimit, setEffectiveLimit] = useState<number>(1);
  const [limitReached, setLimitReached] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [captchaError, setCaptchaError] = useState(false);
  // Changing this key forces React to fully remount the widget — the only
  // reliable way to recover once challenges.cloudflare.com errored out
  const [captchaRetry, setCaptchaRetry] = useState(0);
  const [adLoaded, setAdLoaded] = useState(false);
  const [adTimedOut, setAdTimedOut] = useState(false);
  const [adVerified, setAdVerified] = useState(false);

  const checkAdVerified = useCallback(async () => {
    try {
      const res = await fetch(`/api/ad/status?address=${encodeURIComponent(address)}`);
      const data = await res.json();
      if (data.verified) {
        setAdVerified(true);
      } else {
        // Fall back to local flag (set when the shortlink callback page loads)
        const flag = localStorage.getItem(`ad_verified_${address}`);
        const flagDate = flag ? flag.split('T')[0] : null;
        const today = new Date().toISOString().split('T')[0];
        setAdVerified(flagDate === today);
      }
    } catch {
      const flag = localStorage.getItem(`ad_verified_${address}`);
      const flagDate = flag ? flag.split('T')[0] : null;
      const today = new Date().toISOString().split('T')[0];
      setAdVerified(flagDate === today);
    }
  }, [address]);

  useEffect(() => {
    const stored = localStorage.getItem(`cooldown_${address}`);
    if (stored) {
      const elapsed = Date.now() - Number(stored);
      setCountdown(Math.max(0, COOLDOWN_MS - elapsed));
    }

    const limitDate = localStorage.getItem(`limit_${address}`);
    if (limitDate) {
      const today = new Date().toDateString();
      if (limitDate === today) {
        setLimitReached(true);
      } else {
        localStorage.removeItem(`limit_${address}`);
      }
    }
  }, [address]);

  useEffect(() => {
    if (countdown <= 0) return;
    const id = setInterval(() => setCountdown((c) => Math.max(0, c - 1000)), 1000);
    return () => clearInterval(id);
  }, [countdown]);

  // Verify ad interaction server-side on mount, on focus (returning from
  // the shortlink page), and periodically
  useEffect(() => {
    checkAdVerified();
    const onFocus = () => checkAdVerified();
    window.addEventListener('focus', onFocus);
    const interval = setInterval(checkAdVerified, 60_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [checkAdVerified]);

  // If the actual ad iframe/network never responds, lock the claim button
  useEffect(() => {
    if (adLoaded) return;
    const id = setTimeout(() => setAdTimedOut(true), AD_LOAD_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [adLoaded]);

  const minutes = String(Math.floor(countdown / 60000)).padStart(2, '0');
  const seconds = String(Math.floor((countdown % 60000) / 1000)).padStart(2, '0');

  // Auto-reset Turnstile after every attempt
  const resetCaptcha = useCallback(() => {
    turnstileRef.current?.reset();
    setTurnstileToken(null);
  }, []);

  const showMessage = (text: string, type: MessageType) => {
    setMessage(text);
    setMessageType(type);
    if (type !== 'error') {
      setTimeout(() => { setMessage(''); }, 4000);
    }
  };

  const claim = async () => {
    // Block if popunder ad interaction was not genuinely completed —
    // this click itself is what triggers the Adsterra popunder
    if (!popunderVerified) {
      if (popunderBlocked) {
        showMessage('⚠️ Popup blocked — allow popups for this site, then click again', 'info');
        return;
      }
      if (popunderClosedEarly) {
        showMessage('⚠️ Popunder closed too early — click again and keep it open', 'info');
        return;
      }
      showMessage('⚠️ Click again after the popunder ad opens to verify interaction', 'info');
      return;
    }

    // Block if ad interaction not verified
    if (!adVerified) {
      showMessage('⚠️ Complete a shortlink first to unlock faucet claims', 'info');
      return;
    }

    // Block if ads did not load their network response
    if (adBlockDetected || adTimedOut) {
      showMessage('⚠️ Ads are not loading. Disable your adblocker or shields.', 'info');
      return;
    }

    // Block if cooldown active
    if (countdown > 0) {
      showMessage(`⏳ Please wait ${minutes}:${seconds} before claiming`, 'info');
      return;
    }

    // Prompt captcha if not completed
    if (!turnstileToken) {
      showMessage('☑️ Please complete the captcha first', 'info');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, turnstileToken }),
      });

      const data = await res.json();

      // Force reset captcha after every attempt
      resetCaptcha();

      if (!res.ok) {
        if (res.status === 403 && data.code === 'ad_verification_required') {
          setAdVerified(false);
          showMessage('⚠️ Complete a shortlink first to unlock faucet claims', 'info');
          return;
        }
        if (data.daily_limit && data.daily_claims && data.daily_claims >= data.daily_limit) {
          setLimitReached(true);
          setDailyClaims(data.daily_claims);
          setDailyLimit(data.daily_limit);
          setBonusClaims(data.bonus_claims ?? 0);
          setEffectiveLimit(data.effective_limit ?? data.daily_limit);
          localStorage.setItem(`limit_${address}`, new Date().toDateString());
          showMessage('Daily limit reached. Complete a shortlink to unlock more claims!', 'info');
          return;
        }
        const errorText = data.error || 'Something went wrong.';
        showMessage(`❌ ${errorText}`, 'error');
        return;
      }

      setBalance(data.balance);
      setDailyClaims(data.daily_claims);
      setDailyLimit(data.daily_limit);
      setBonusClaims(data.bonus_claims ?? 0);
      setEffectiveLimit(data.effective_limit ?? data.daily_limit);
      showMessage(`✅ Successfully claimed ${REWARD} ${CURRENCY}!`, 'success');
      localStorage.setItem(`cooldown_${address}`, String(Date.now()));
      setCountdown(COOLDOWN_MS);
    } catch {
      resetCaptcha();
      showMessage('❌ Network error. Check your connection.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const isCooldown = countdown > 0;
  const adsBlocked = adBlockDetected || adTimedOut;
  const isLimitReached = limitReached || (adsBlocked && !adBlockChecking);
  const captchaUnavailable = !TURNSTILE_SITE_KEY;

  const messageStyles = {
    success: 'bg-green-100 border-green-300 text-green-800',
    error: 'bg-red-100 border-red-300 text-red-700',
    info: 'bg-blue-100 border-blue-200 text-blue-700',
  };

  const buttonLabel = loading
    ? 'Processing...'
    : captchaUnavailable
      ? 'Captcha Unavailable'
      : adBlockDetected || adTimedOut
        ? 'Ads Not Loading'
        : popunderChecking
          ? `Watching Ad… ${adSecondsRemaining ?? AD_VIEW_SECONDS}s`
          : !popunderVerified
            ? popunderBlocked
              ? 'Popup Blocked — Allow Popups'
              : 'Click to Trigger Popunder Ad'
            : !adVerified
              ? 'Complete a Shortlink First'
              : isLimitReached
                ? 'Limit Reached'
                : isCooldown
                  ? `Wait ${minutes}:${seconds}`
                  : `Claim ${REWARD} ${CURRENCY}`;

  const buttonDisabled =
    loading ||
    adsBlocked ||
    popunderChecking ||
    !adVerified ||
    isLimitReached ||
    isCooldown ||
    captchaUnavailable;

  return (
    <div className="w-full max-w-md mx-auto overflow-hidden p-6 rounded-2xl bg-gradient-to-br from-yellow-400 via-orange-400 to-red-500 shadow-xl">
      <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 space-y-4">
        <div className="text-center">
          <p className="text-sm text-gray-500 font-medium">Total Claimed ({CURRENCY})</p>
          <p className="text-3xl font-bold text-gray-900">
            {balance !== null ? balance.toFixed(4) : '—'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Today: {dailyClaims ?? 0}/{effectiveLimit}
            {bonusClaims > 0 && (
              <span className="text-green-500"> (+{bonusClaims} bonus)</span>
            )}
          </p>
        </div>

        <div className="text-center bg-yellow-50 border border-yellow-200 rounded-lg py-2 px-4">
          <p className="text-sm font-semibold text-yellow-800">
            Reward: {REWARD} {CURRENCY} per claim
          </p>
          <p className="text-xs text-yellow-600 mt-1">
            Complete a shortlink first to unlock faucet claims — each shortlink grants +10 claims!
          </p>
        </div>

        <AdSlot slot="aboveClaim" onAdLoad={() => setAdLoaded(true)} className="my-2" />

        {!TURNSTILE_SITE_KEY ? (
          // Fail loudly instead of silently rendering nothing — this exact
          // symptom appears when the NEXT_PUBLIC var was missing at build time
          <div className="w-full my-2 border rounded-lg px-4 py-3 text-sm font-medium bg-red-100 border-red-300 text-red-700">
            ⚠️ Captcha widget unavailable: NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set. Add it to your
            environment and rebuild/redeploy.
          </div>
        ) : (
          <div className="w-full flex flex-col items-center my-2">
            <div
              className="flex justify-center overflow-hidden"
              style={{ minHeight: '70px' }}
            >
              <div style={{ transform: 'scale(0.85)', transformOrigin: 'center' }}>
                <Turnstile
                  key={captchaRetry}
                  ref={turnstileRef}
                  siteKey={TURNSTILE_SITE_KEY}
                  onSuccess={(token) => {
                    setTurnstileToken(token);
                    setCaptchaError(false);
                  }}
                  onExpire={() => setTurnstileToken(null)}
                  onError={() => {
                    setTurnstileToken(null);
                    setCaptchaError(true);
                  }}
                  options={{ theme: 'light', size: 'flexible' }}
                />
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Protected by Cloudflare Turnstile</p>
          </div>
        )}

        {TURNSTILE_SITE_KEY && captchaError && (
          <div className="border rounded-lg px-4 py-3 text-sm font-medium bg-red-100 border-red-300 text-red-700">
            <p>
              Captcha failed to load — check your connection, VPN, or adblocker.
            </p>
            <button
              onClick={() => {
                setCaptchaError(false);
                setCaptchaRetry((n) => n + 1);
              }}
              className="mt-2 py-1.5 px-3 rounded-md font-semibold text-xs bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              Retry Captcha
            </button>
          </div>
        )}

        <button
          onClick={claim}
          disabled={buttonDisabled}
          className={`w-full py-3 px-6 rounded-lg font-semibold text-lg transition-all duration-200 ${
            buttonDisabled
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white hover:scale-105 hover:shadow-lg active:scale-95'
          }`}
        >
          {buttonLabel}
        </button>

        {adBlockDetected && !adBlockChecking && (
          <div className="border rounded-lg px-4 py-3 text-sm font-medium bg-red-100 border-red-300 text-red-700">
            Adblocker detected — ads are not loading. Disable your adblocker to claim.
          </div>
        )}
        {!adBlockDetected && adTimedOut && (
          <div className="border rounded-lg px-4 py-3 text-sm font-medium bg-red-100 border-red-300 text-red-700">
            Ads failed to load (no network response). Reload the page or disable your adblocker.
          </div>
        )}
        {!adsBlocked && popunderChecking && (
          <div className="border rounded-lg px-4 py-3 text-sm font-medium bg-blue-50 border-blue-200 text-blue-700">
            <div className="flex items-center justify-between">
              <span>Verifying ad view — keep the tab open…</span>
              <span className="font-mono font-bold">{adSecondsRemaining ?? AD_VIEW_SECONDS}s</span>
            </div>
            <div className="mt-2 h-1.5 w-full bg-blue-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{
                  width: `${((AD_VIEW_SECONDS - (adSecondsRemaining ?? AD_VIEW_SECONDS)) / AD_VIEW_SECONDS) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
        {!adsBlocked && !popunderVerified && !popunderChecking && (
          <div className="border rounded-lg px-4 py-3 text-sm font-medium bg-blue-100 border-blue-200 text-blue-700">
            {popunderBlocked
              ? 'Popup blocked — allow popups for this site, then click the button again.'
              : popunderClosedEarly
                ? 'The popunder ad was closed too early — click again and keep the ad open to verify interaction.'
                : 'Click the button to trigger the popunder ad. Keep it open to verify the ad interaction.'}
          </div>
        )}
        {!adsBlocked && popunderVerified && !adVerified && (
          <div className="border rounded-lg px-4 py-3 text-sm font-medium bg-blue-100 border-blue-200 text-blue-700">
            Complete a shortlink to verify ad interaction and unlock faucet claims.
          </div>
        )}
        {isLimitReached && !adsBlocked && (
          <div className="border rounded-lg px-4 py-3 text-sm font-medium bg-red-100 border-red-300 text-red-700">
            Daily limit reached. Complete a shortlink to unlock more claims!
          </div>
        )}

        {message && (
          <div className={`border rounded-lg px-4 py-3 text-sm font-medium ${messageStyles[messageType]}`}>
            {message}
          </div>
        )}

        <AdBanner onAdLoad={() => setAdLoaded(true)} />
      </div>
    </div>
  );
}
