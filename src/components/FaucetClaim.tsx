'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface FaucetRow {
  balance: number;
  last_claim_at: string | null;
}

export default function FaucetClaim() {
  const supabase = createClient();
  const { user } = useAuth();
  const [balance, setBalance] = useState<number>(0);
  const [countdown, setCountdown] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const fetchClaims = useCallback(async () => {
    if (!user) return;

    const { data } = await supabase
      .from('faucet_claims')
      .select('balance, last_claim_at')
      .eq('user_id', user.id)
      .single<FaucetRow>();

    if (data) {
      setBalance(data.balance);
      if (data.last_claim_at) {
        const elapsed = Date.now() - new Date(data.last_claim_at).getTime();
        setCountdown(Math.max(0, 300_000 - elapsed));
      }
    }
  }, [supabase, user]);

  useEffect(() => { fetchClaims(); }, [fetchClaims]);

  useEffect(() => {
    if (countdown <= 0) return;
    const id = setInterval(() => setCountdown((c) => Math.max(0, c - 1000)), 1000);
    return () => clearInterval(id);
  }, [countdown]);

  const claim = async () => {
    if (!user) return;

    setLoading(true);
    const now = new Date().toISOString();

    const { error } = await supabase.rpc('claim_faucet', {
      p_user_id: user.id,
      p_claimed_at: now,
    });

    if (error) {
      if (error.message.includes('cooldown')) {
        const { data } = await supabase
          .from('faucet_claims')
          .select('last_claim_at')
          .eq('user_id', user.id)
          .single<FaucetRow>();
        if (data?.last_claim_at) {
          const remaining = 300_000 - (Date.now() - new Date(data.last_claim_at).getTime());
          setCountdown(Math.max(0, remaining));
        }
      }
    } else {
      setBalance((b) => b + 0.001);
      setCountdown(300_000);
    }
    setLoading(false);
  };

  const minutes = String(Math.floor(countdown / 60000)).padStart(2, '0');
  const seconds = String(Math.floor((countdown % 60000) / 1000)).padStart(2, '0');
  const canClaim = countdown <= 0 && !loading;

  return (
    <div className="w-full max-w-md mx-auto p-6 rounded-2xl bg-gradient-to-br from-yellow-400 via-orange-400 to-red-500 shadow-xl">
      <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 space-y-4">
        <div className="text-center">
          <p className="text-sm text-gray-500 font-medium">Coin Balance</p>
          <p className="text-3xl font-bold text-gray-900">{balance.toFixed(4)}</p>
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
            ? 'Claiming...'
            : canClaim
              ? 'Claim Free Coins'
              : `Next claim in ${minutes}:${seconds}`}
        </button>
      </div>
    </div>
  );
}
