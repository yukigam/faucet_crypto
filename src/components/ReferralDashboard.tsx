'use client';

import { useState, useEffect } from 'react';

export default function ReferralDashboard({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const [referralCount, setReferralCount] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem(`referrals_${address}`);
    if (stored) queueMicrotask(() => setReferralCount(Number(stored)));
  }, [address]);

  const referralLink = address
    ? `${window.location.origin}?ref=${encodeURIComponent(address)}`
    : '';

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = referralLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Track referral from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref && ref !== address) {
      localStorage.setItem('referrer', ref);
    }
  }, [address]);

  return (
    <div className="w-full max-w-md mx-auto overflow-hidden p-6 rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-400 to-cyan-500 shadow-xl">
      <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 space-y-6">
        <h2 className="text-xl font-bold text-gray-900 text-center">
          Referral Program
        </h2>

        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
          <p className="text-sm text-gray-500 font-medium">Your Referral Link</p>
          <div className="flex flex-col sm:flex-row gap-2 w-full">
            <input
              type="text"
              readOnly
              value={referralLink}
              className="w-full min-w-0 text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-700 truncate"
            />
            <button
              onClick={copyToClipboard}
              className={`shrink-0 px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ${
                copied
                  ? 'bg-emerald-500 text-white'
                  : 'bg-gray-800 text-white hover:bg-gray-700 active:scale-95'
              }`}
            >
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
          <p className="text-amber-800 font-medium">
            Invite friends and earn <span className="font-bold">10%</span> of their claims forever!
          </p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 text-center">
          <p className="text-sm text-gray-500 font-medium">Total Referrals</p>
          <p className="text-3xl font-bold text-gray-900">{referralCount}</p>
        </div>
      </div>
    </div>
  );
}
