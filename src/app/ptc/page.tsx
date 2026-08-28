'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment, useCallback, useEffect, useState } from 'react';
import SidebarNav from '@/components/SidebarNav';
import AdSlot from '@/components/AdSlot';

const STORAGE_KEY = 'faucetpay_address';
const CURRENCY = 'TON';

type PtcAd = {
  id: string;
  title: string;
  reward: number;
  duration_seconds: number;
  viewed_today: boolean;
};

function fmtAmount(n: number): string {
  return n.toFixed(5).replace(/0+$/, '').replace(/\.$/, '');
}

export default function PtcPage() {
  const router = useRouter();
  const [address, setAddress] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [ads, setAds] = useState<PtcAd[] | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  // Deferred into rAF so the first client render matches the server render
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setAddress(localStorage.getItem(STORAGE_KEY));
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const loadAds = useCallback(async (addr: string) => {
    try {
      const res = await fetch(`/api/ptc/ads?address=${encodeURIComponent(addr)}`);
      const data = await res.json();
      setAds(Array.isArray(data.ads) ? data.ads : []);
    } catch {
      setAds([]);
    }
  }, []);

  useEffect(() => {
    if (!address) return;
    loadAds(address);
    const onFocus = () => loadAds(address);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [address, loadAds]);

  const handleSetAddress = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    localStorage.setItem(STORAGE_KEY, inputValue.trim());
    setAddress(inputValue.trim());
  };

  const viewAd = async (ad: PtcAd) => {
    if (!address || ad.viewed_today || startingId) return;

    setStartingId(ad.id);
    setMessage('');
    try {
      const res = await fetch('/api/ptc/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, adId: ad.id }),
      });
      const data = await res.json();

      if (!res.ok || !data.success || !data.token) {
        setMessage(`⚠️ ${data.error || 'Failed to open ad'}`);
        setStartingId(null);
        return;
      }

      router.push(`/ptc/view?token=${encodeURIComponent(data.token)}`);
    } catch {
      setMessage('❌ Network error. Check your connection.');
      setStartingId(null);
    }
  };

  if (!address) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-8">
        <SidebarNav />
        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
          PTC Ads
        </h1>
        <div className="w-full max-w-md mx-auto overflow-hidden p-6 rounded-2xl bg-gradient-to-br from-purple-500 via-violet-500 to-indigo-600 shadow-xl">
          <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6">
            <form onSubmit={handleSetAddress} className="space-y-4">
              <p className="text-sm text-gray-700 font-medium">Enter your FaucetPay email first</p>
              <input
                type="text"
                required
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="e.g. your@email.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
              />
              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-90 transition-opacity"
              >
                Browse Ads
              </button>
            </form>
          </div>
        </div>
        <AdSlot slot="ptcListTop" className="w-full max-w-md" />
      </main>
    );
  }

  const availableCount = ads?.filter((a) => !a.viewed_today).length ?? 0;

  return (
    <main className="min-h-screen flex flex-col items-center p-6 gap-6 md:pl-64">
      <SidebarNav />

      <h1 className="w-full max-w-md text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
        Paid-To-Click Ads
      </h1>

      <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 md:hidden">
        PTC Ads
      </h1>

      <div className="text-center bg-yellow-50 border border-yellow-200 rounded-lg py-2 px-6">
        <p className="text-sm font-semibold text-yellow-800">
          {ads === null ? 'Loading ads…' : `${availableCount} ad${availableCount !== 1 ? 's' : ''} available today`}
        </p>
        <p className="text-xs text-yellow-600 mt-1">Watch each ad once per day to earn its reward.</p>
      </div>

      <AdSlot slot="ptcListTop" className="w-full max-w-md" />

      {message && (
        <div className="border rounded-lg px-4 py-3 text-sm font-medium bg-blue-100 border-blue-200 text-blue-700 max-w-md">
          {message}
        </div>
      )}

      <div className="w-full max-w-md space-y-3">
        {ads === null && (
          <div className="rounded-xl bg-gray-800 p-5 text-center text-gray-400 text-sm animate-pulse">
            Loading available ads…
          </div>
        )}
        {ads !== null && ads.length === 0 && (
          <div className="rounded-xl bg-gray-800 p-5 text-center text-gray-400 text-sm">
            No ads available right now — check back soon!
          </div>
        )}
        {ads?.map((ad, index) => (
          <Fragment key={ad.id}>
            <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-white text-sm">{ad.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Reward: <span className="font-bold text-green-400">{fmtAmount(ad.reward)} {CURRENCY}</span>
                    {' · '}
                    Watch time: {ad.duration_seconds}s
                  </p>
                </div>
                {ad.viewed_today ? (
                  <span className="shrink-0 px-4 py-2 rounded-lg text-sm font-semibold bg-gray-700 text-green-400">
                    ✓ Done
                  </span>
                ) : (
                  <button
                    onClick={() => viewAd(ad)}
                    disabled={startingId !== null}
                    className={`shrink-0 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                      startingId && startingId !== ad.id
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:scale-105 active:scale-95'
                    }`}
                  >
                    {startingId === ad.id ? 'Opening…' : 'View'}
                  </button>
                )}
              </div>
            </div>
            {/* Interleave an Adsterra banner every 10 ads — users scrolling the
                long list hit an impression even if they never open an ad */}
            {index % 10 === 9 && index !== ads.length - 1 && (
              <AdSlot slot="ptcListInline" className="w-full max-w-md" />
            )}
          </Fragment>
        ))}
      </div>

      {/* Same zone as the top slot — each frame loads and reports its own impression */}
      <AdSlot slot="ptcListTop" className="w-full max-w-md" />

      <Link href="/" className="text-xs text-gray-500 hover:text-white transition-colors">
        ← Back to Faucet
      </Link>
    </main>
  );
}
