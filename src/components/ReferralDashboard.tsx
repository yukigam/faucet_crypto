'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export default function ReferralDashboard() {
  const supabase = createClient();
  const { user } = useAuth();
  const [referralCode, setReferralCode] = useState('');
  const [referredBy, setReferredBy] = useState<string | null>(null);
  const [referralCount, setReferralCount] = useState(0);
  const [copied, setCopied] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!user) return;

    const { data } = await supabase
      .from('profiles')
      .select('referral_code, referred_by')
      .eq('id', user.id)
      .single<{ referral_code: string; referred_by: string | null }>();

    if (data) {
      setReferralCode(data.referral_code);
      setReferredBy(data.referred_by);
    }
  }, [supabase, user]);

  const fetchReferrals = useCallback(async () => {
    if (!user) return;
    const { count } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('referred_by', user.id);
    setReferralCount(count ?? 0);
  }, [supabase, user]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);
  useEffect(() => { fetchReferrals(); }, [fetchReferrals]);

  const referralLink = referralCode
    ? `https://myfaucet.com/signup?ref=${referralCode}`
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

  return (
    <div className="w-full max-w-md mx-auto p-6 rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-400 to-cyan-500 shadow-xl">
      <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 space-y-6">
        <h2 className="text-xl font-bold text-gray-900 text-center">
          Referral Program
        </h2>

        {referredBy && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
            <p className="text-blue-700 text-sm">
              You were referred by user <span className="font-mono font-bold">{referredBy.slice(0, 8)}</span>
            </p>
          </div>
        )}

        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
          <p className="text-sm text-gray-500 font-medium">Your Referral Link</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={referralLink}
              className="flex-1 text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 text-gray-700 truncate"
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
