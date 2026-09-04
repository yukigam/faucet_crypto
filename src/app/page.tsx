'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import FaucetClaim from '@/components/FaucetClaim';
import ShortlinkClaim from '@/components/ShortlinkClaim';
import ReferralDashboard from '@/components/ReferralDashboard';
import AdBanner from '@/components/AdBanner';
import AdSlot from '@/components/AdSlot';
import SidebarNav from '@/components/SidebarNav';

const STORAGE_KEY = 'faucetpay_address';
type Tab = 'faucet' | 'shortlink';

type Stats = {
  total_payouts: number;
  total_users: number;
  active_offers: number;
};

const HOW_IT_WORKS = [
  {
    icon: '🚰',
    title: '1. Claim from the Faucet',
    text: 'Enter your FaucetPay email and claim free crypto every 5 minutes — no wallet, signup or deposit required.',
  },
  {
    icon: '📺',
    title: '2. View PTC Ads',
    text: 'Watch sponsor advertisements for a few seconds each and earn extra rewards on top of faucet claims.',
  },
  {
    icon: '🔗',
    title: '3. Complete Shortlinks',
    text: 'Finish quick shortlink tasks to unlock bonus claims and multiply your daily earnings.',
  },
];

const FEATURES = [
  { icon: '⚡', title: 'Instant Payouts', text: 'Rewards are sent straight to your FaucetPay account the moment you claim — no minimum withdrawal.' },
  { icon: '🛡️', title: 'Captcha Protected', text: 'Cloudflare Turnstile keeps the faucet bot-free and fair for every user.' },
  { icon: '👥', title: 'Referral Program', text: 'Invite friends with your personal link and earn from every claim they make.' },
  { icon: '🌍', title: 'Available Worldwide', text: 'Anyone with a FaucetPay email can participate, from any country.' },
];

export default function Home() {
  const [savedAddress, setSavedAddress] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('faucet');
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) queueMicrotask(() => setSavedAddress(stored));
  }, []);

  // Public aggregate stats for the landing page — purely informational,
  // hidden gracefully if the endpoint is unavailable.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/stats')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Stats | null) => {
        if (!cancelled && data && typeof data.total_payouts === 'number') {
          setStats(data);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    localStorage.setItem(STORAGE_KEY, inputValue.trim());
    setSavedAddress(inputValue.trim());
  };

  const handleReset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setSavedAddress(null);
  };

  const formatCount = (n: number) => new Intl.NumberFormat('en-US').format(n);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'faucet', label: 'Faucet' },
    { key: 'shortlink', label: 'Shortlink' },
  ];

  if (!savedAddress) {
    return (
      <main className="min-h-screen flex flex-col items-center p-6 gap-10">
        <AdBanner />

        {/* Hero */}
        <section className="flex flex-col items-center text-center gap-4 max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
            Free Crypto Rewards, Every 5 Minutes
          </h1>
          <p className="text-gray-400 text-base md:text-lg">
            A fair, instant-paying crypto faucet. Claim from the faucet, watch PTC
            ads, complete shortlinks and invite friends — all payouts go straight
            to your FaucetPay wallet.
          </p>
          {stats && (
            <div className="mt-2 grid grid-cols-3 gap-3 w-full max-w-lg">
              <div className="rounded-xl bg-gray-900 border border-gray-800 px-3 py-4">
                <p className="text-xl md:text-2xl font-bold text-yellow-400">
                  {formatCount(stats.total_payouts)}
                </p>
                <p className="text-xs text-gray-500 mt-1">Payouts Sent</p>
              </div>
              <div className="rounded-xl bg-gray-900 border border-gray-800 px-3 py-4">
                <p className="text-xl md:text-2xl font-bold text-green-400">
                  {formatCount(stats.total_users)}
                </p>
                <p className="text-xs text-gray-500 mt-1">Active Users</p>
              </div>
              <div className="rounded-xl bg-gray-900 border border-gray-800 px-3 py-4">
                <p className="text-xl md:text-2xl font-bold text-cyan-400">
                  {formatCount(stats.active_offers)}
                </p>
                <p className="text-xs text-gray-500 mt-1">Active Offers</p>
              </div>
            </div>
          )}
        </section>

        <div className="w-full max-w-md mx-auto overflow-hidden p-6 rounded-2xl bg-gradient-to-br from-purple-500 via-violet-500 to-indigo-600 shadow-xl">
          <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6">
            <form onSubmit={handleStart} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Enter your FaucetPay Email
                </label>
                <input
                  type="text"
                  required
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="e.g. your@email.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-90 transition-opacity"
              >
                Start Claiming
              </button>
            </form>
          </div>
        </div>

        {/* How it works */}
        <section className="w-full max-w-4xl">
          <h2 className="text-2xl font-bold text-center text-white">How It Works</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.title} className="rounded-2xl bg-gray-900 border border-gray-800 p-6 text-center">
                <span className="text-3xl">{step.icon}</span>
                <h3 className="mt-3 font-semibold text-white">{step.title}</h3>
                <p className="mt-2 text-sm text-gray-400">{step.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="w-full max-w-4xl">
          <h2 className="text-2xl font-bold text-center text-white">Why Choose Us</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-4 rounded-2xl bg-gray-900 border border-gray-800 p-5">
                <span className="text-2xl">{f.icon}</span>
                <div>
                  <h3 className="font-semibold text-white">{f.title}</h3>
                  <p className="mt-1 text-sm text-gray-400">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* PTC teaser */}
        <section className="w-full max-w-4xl rounded-2xl bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 p-6 text-center">
          <h2 className="text-xl font-bold text-white">Earn even more with PTC Ads</h2>
          <p className="mt-2 text-sm text-gray-400">
            Browse sponsor sites for a few seconds each and get paid for every view.
          </p>
          <Link
            href="/ptc"
            className="mt-4 inline-block rounded-lg bg-gradient-to-r from-yellow-400 to-orange-500 px-6 py-2.5 font-semibold text-sm text-white hover:opacity-90 transition-opacity"
          >
            Open PTC Ads →
          </Link>
        </section>

        <AdBanner />
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center p-6 gap-6 md:pl-64">
      {/* Sticky sidebar ads — only on wide screens where the centered
          column leaves empty space, so the layout is never disturbed */}
      <div className="pointer-events-none fixed inset-y-0 right-0 z-0 hidden xl:flex items-center">
        <div className="pointer-events-auto mr-4 w-[300px]">
          <AdSlot slot="sidebar" />
        </div>
      </div>

      <SidebarNav />

      <AdBanner />

      <div className="w-full max-w-md flex items-center justify-between">
        <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
          Crypto Faucet
        </h1>
        <button
          onClick={handleReset}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          Change Address
        </button>
      </div>

      <p className="text-gray-400 -mt-3 text-sm truncate max-w-md">{savedAddress}</p>

      <div className="w-full max-w-md flex bg-gray-800 rounded-lg p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
              activeTab === tab.key
                ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white shadow-lg'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'faucet' ? (
        <FaucetClaim address={savedAddress} />
      ) : (
        <ShortlinkClaim address={savedAddress} />
      )}

      <ReferralDashboard address={savedAddress} />
    </main>
  );
}
