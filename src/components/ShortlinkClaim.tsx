'use client';

import { useState, useEffect } from 'react';
import AdBanner from './AdBanner';

const REWARD = '0.0005';
const CURRENCY = 'TON';
const SHORTLINK_DAILY_LIMIT = 10;

type MessageType = 'success' | 'error' | 'info';

export default function ShortlinkClaim({ address }: { address: string }) {
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<MessageType>('info');
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [dailyClaims, setDailyClaims] = useState(0);
  const [limitReached, setLimitReached] = useState(false);

  useEffect(() => {
    const key = `shortlink_count_${address}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      const { date, count } = JSON.parse(stored);
      const today = new Date().toDateString();
      if (date === today) {
        setDailyClaims(count);
        if (count >= SHORTLINK_DAILY_LIMIT) {
          setLimitReached(true);
        }
      } else {
        localStorage.removeItem(key);
      }
    }
  }, [address]);

  const showMessage = (text: string, type: MessageType) => {
    setMessage(text);
    setMessageType(type);
    if (type !== 'error') {
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const startShortlink = async () => {
    setLoading(true);
    setMessage('');

    try {
      const res = await fetch('/api/shortlink/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.daily_limit && data.daily_claims && data.daily_claims >= data.daily_limit) {
          setLimitReached(true);
          setDailyClaims(data.daily_claims);
          localStorage.setItem(
            `shortlink_count_${address}`,
            JSON.stringify({ date: new Date().toDateString(), count: data.daily_claims })
          );
          showMessage('Shortlink limit reached. Come back tomorrow!', 'info');
          return;
        }
        showMessage('❌ ' + (data.error || 'Failed to start'), 'error');
        return;
      }

      setDailyClaims(data.daily_claims || 0);
      localStorage.setItem(
        `shortlink_count_${address}`,
        JSON.stringify({ date: new Date().toDateString(), count: data.daily_claims || 0 })
      );

      // Redirect user's browser to the ShrinkMe shortlink
      setRedirecting(true);
      window.location.href = data.redirectUrl;
    } catch {
      showMessage('❌ Network error. Check your connection.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const remaining = SHORTLINK_DAILY_LIMIT - dailyClaims;
  const isLimitReached = limitReached || remaining <= 0;

  const messageStyles = {
    success: 'bg-green-100 border-green-300 text-green-800',
    error: 'bg-red-100 border-red-300 text-red-700',
    info: 'bg-blue-100 border-blue-200 text-blue-700',
  };

  return (
    <div className="w-full max-w-md mx-auto overflow-hidden p-6 rounded-2xl bg-gradient-to-br from-cyan-400 via-blue-400 to-indigo-500 shadow-xl">
      <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 space-y-4">
        <div className="text-center">
          <p className="text-sm text-gray-500 font-medium">Shortlink Reward ({CURRENCY})</p>
          <p className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-blue-600">
            {REWARD}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Today: {dailyClaims}/{SHORTLINK_DAILY_LIMIT} shortlinks
          </p>
        </div>

        <div className="text-center bg-cyan-50 border border-cyan-200 rounded-lg py-2 px-4">
          <p className="text-sm font-semibold text-cyan-800">
            {remaining > 0
              ? `${remaining} shortlink${remaining !== 1 ? 's' : ''} remaining today`
              : 'No shortlinks remaining today'}
          </p>
        </div>

        <div className="text-center bg-amber-50 border border-amber-200 rounded-lg py-2 px-4">
          <p className="text-sm text-amber-800 font-medium">
            Reward: {REWARD} {CURRENCY} per completed shortlink
          </p>
        </div>

        <button
          onClick={startShortlink}
          disabled={loading || redirecting || isLimitReached}
          className={`w-full py-3 px-6 rounded-lg font-semibold text-lg transition-all duration-200 ${
            loading || redirecting || isLimitReached
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-cyan-400 to-blue-500 text-white hover:scale-105 hover:shadow-lg active:scale-95'
          }`}
        >
          {loading || redirecting ? 'Redirecting...' : isLimitReached ? 'Limit Reached' : 'Start Shortlink →'}
        </button>

        {isLimitReached && (
          <div className="border rounded-lg px-4 py-3 text-sm font-medium bg-red-100 border-red-300 text-red-700">
            Shortlink limit reached. Come back tomorrow!
          </div>
        )}

        {message && (
          <div className={`border rounded-lg px-4 py-3 text-sm font-medium ${messageStyles[messageType]}`}>
            {message}
          </div>
        )}

        <div className="text-xs text-gray-400 text-center space-y-1">
          <p>• Complete the shortlink to receive {REWARD} {CURRENCY}</p>
          <p>• Each shortlink unlocks +10 bonus faucet claims!</p>
          <p>• Limit: {SHORTLINK_DAILY_LIMIT} shortlinks per day</p>
        </div>

        <AdBanner />
      </div>
    </div>
  );
}
