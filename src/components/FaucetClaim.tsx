'use client';

import { useEffect, useState } from 'react';
import AdBanner from './AdBanner';

const REWARD = '0.0001';
const CURRENCY = 'TON';
const COOLDOWN_MS = 300_000;

export default function FaucetClaim({ address }: { address: string }) {
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(`cooldown_${address}`);
    if (stored) {
      const elapsed = Date.now() - Number(stored);
      setCountdown(Math.max(0, COOLDOWN_MS - elapsed));
    }
  }, [address]);

  useEffect(() => {
    if (countdown <= 0) return;
    const id = setInterval(() => setCountdown((c) => Math.max(0, c - 1000)), 1000);
    return () => clearInterval(id);
  }, [countdown]);

  const claim = async () => {
    setLoading(true);
    setMessage('');

    try {
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setMessage('⏳ Please wait 5 minutes between claims.');
        } else if (data.error) {
          setMessage(`❌ ${data.error}`);
        } else {
          setMessage('❌ Something went wrong. Try again.');
        }
        return;
      }

      setBalance(data.balance);
      setMessage(data.message || `Successfully claimed ${REWARD} ${CURRENCY}!`);
      localStorage.setItem(`cooldown_${address}`, String(Date.now()));
      setCountdown(COOLDOWN_MS);
    } catch {
      setMessage('❌ Network error. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(''), 4000);
    return () => clearTimeout(id);
  }, [message]);

  const minutes = String(Math.floor(countdown / 60000)).padStart(2, '0');
  const seconds = String(Math.floor((countdown % 60000) / 1000)).padStart(2, '0');
  const canClaim = countdown <= 0 && !loading;

  return (
    <div className="w-full max-w-md mx-auto p-6 rounded-2xl bg-gradient-to-br from-yellow-400 via-orange-400 to-red-500 shadow-xl">
      <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 space-y-4">
        <div className="text-center">
          <p className="text-sm text-gray-500 font-medium">Total Claimed ({CURRENCY})</p>
          <p className="text-3xl font-bold text-gray-900">
            {balance !== null ? balance.toFixed(4) : '—'}
          </p>
        </div>

        <div className="text-center bg-yellow-50 border border-yellow-200 rounded-lg py-2 px-4">
          <p className="text-sm font-semibold text-yellow-800">
            Reward: {REWARD} {CURRENCY} per claim
          </p>
        </div>

        <button
          onClick={claim}
          disabled={!canClaim}
          className={`w-full py-3 px-6 rounded-lg font-semibold text-lg transition-all duration-200 ${
            canClaim
              ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white hover:scale-105 hover:shadow-lg active:scale-95'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {loading
            ? 'Processing...'
            : canClaim
              ? `Claim ${REWARD} ${CURRENCY}`
              : `Next claim in ${minutes}:${seconds}`}
        </button>

        {message && (
          <p className="text-center text-sm text-gray-600 font-medium">{message}</p>
        )}

        <AdBanner position="below-claim" />
      </div>
    </div>
  );
}
