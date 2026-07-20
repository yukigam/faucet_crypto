'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import AdBanner from './AdBanner';

const REWARD = '0.00002';
const CURRENCY = 'TON';
const COOLDOWN_MS = 60_000;

type MessageType = 'success' | 'error' | 'info';

export default function FaucetClaim({ address }: { address: string }) {
  const turnstileRef = useRef<TurnstileInstance>(null);
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<MessageType>('info');
  const [balance, setBalance] = useState<number | null>(null);
  const [dailyClaims, setDailyClaims] = useState<number | undefined>(undefined);
  const [dailyLimit, setDailyLimit] = useState<number | undefined>(undefined);
  const [limitReached, setLimitReached] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

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
        if (data.daily_limit && data.daily_claims && data.daily_claims >= data.daily_limit) {
          setLimitReached(true);
          setDailyClaims(data.daily_claims);
          setDailyLimit(data.daily_limit);
          localStorage.setItem(`limit_${address}`, new Date().toDateString());
          showMessage('Та өнөөдрийн лимитээ дуусгасан, маргааш дахин ирээрэй', 'info');
          return;
        }
        const errorText = data.error || 'Something went wrong.';
        showMessage(`❌ ${errorText}`, 'error');
        return;
      }

      setBalance(data.balance);
      setDailyClaims(data.daily_claims);
      setDailyLimit(data.daily_limit);
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
  const isLimitReached = limitReached;

  const messageStyles = {
    success: 'bg-green-100 border-green-300 text-green-800',
    error: 'bg-red-100 border-red-300 text-red-700',
    info: 'bg-blue-100 border-blue-200 text-blue-700',
  };

  const buttonLabel = loading
    ? 'Processing...'
    : isLimitReached
      ? 'Limit Reached'
      : isCooldown
        ? `Wait ${minutes}:${seconds}`
        : `Claim ${REWARD} ${CURRENCY}`;

  return (
    <div className="w-full max-w-md mx-auto overflow-hidden p-6 rounded-2xl bg-gradient-to-br from-yellow-400 via-orange-400 to-red-500 shadow-xl">
      <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 space-y-4">
        <div className="text-center">
          <p className="text-sm text-gray-500 font-medium">Total Claimed ({CURRENCY})</p>
          <p className="text-3xl font-bold text-gray-900">
            {balance !== null ? balance.toFixed(4) : '—'}
          </p>
          {dailyLimit !== undefined && (
            <p className="text-xs text-gray-400 mt-1">
              Today: {dailyClaims ?? 0}/{dailyLimit}
            </p>
          )}
        </div>

        <div className="text-center bg-yellow-50 border border-yellow-200 rounded-lg py-2 px-4">
          <p className="text-sm font-semibold text-yellow-800">
            Reward: {REWARD} {CURRENCY} per claim
          </p>
        </div>

        <div className="w-full flex justify-center overflow-hidden my-2">
          <div style={{ transform: 'scale(0.85)', transformOrigin: 'center' }}>
            <Turnstile
              ref={turnstileRef}
              siteKey="0x4AAAAAAD5kW6zX8NLmEIT1"
              onSuccess={(token) => setTurnstileToken(token)}
              onExpire={() => setTurnstileToken(null)}
              options={{ theme: 'light', size: 'flexible' }}
            />
          </div>
        </div>

        <button
          onClick={claim}
          disabled={isLimitReached}
          className={`w-full py-3 px-6 rounded-lg font-semibold text-lg transition-all duration-200 ${
            isCooldown || isLimitReached
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white hover:scale-105 hover:shadow-lg active:scale-95'
          }`}
        >
          {buttonLabel}
        </button>

        {isLimitReached && (
          <div className="border rounded-lg px-4 py-3 text-sm font-medium bg-red-100 border-red-300 text-red-700">
            Та өнөөдрийн лимитээ дуусгасан, маргааш дахин ирээрэй
          </div>
        )}

        {message && (
          <div className={`border rounded-lg px-4 py-3 text-sm font-medium ${messageStyles[messageType]}`}>
            {message}
          </div>
        )}

        <AdBanner />
      </div>
    </div>
  );
}
