'use client';

import { useState, useEffect } from 'react';
import FaucetClaim from '@/components/FaucetClaim';
import ShortlinkClaim from '@/components/ShortlinkClaim';
import ReferralDashboard from '@/components/ReferralDashboard';
import AdBanner from '@/components/AdBanner';

const STORAGE_KEY = 'faucetpay_address';
type Tab = 'faucet' | 'shortlink';

export default function Home() {
  const [address, setAddress] = useState('');
  const [savedAddress, setSavedAddress] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('faucet');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setSavedAddress(stored);
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
    setAddress('');
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'faucet', label: 'Faucet' },
    { key: 'shortlink', label: 'Shortlink' },
  ];

  if (!savedAddress) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-8">
<AdBanner />
        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
          Crypto Faucet
        </h1>
        <p className="text-gray-400 -mt-4">Enter your FaucetPay address to start claiming</p>
        <div className="w-full max-w-md mx-auto overflow-hidden p-6 rounded-2xl bg-gradient-to-br from-purple-500 via-violet-500 to-indigo-600 shadow-xl">
          <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6">
            <form onSubmit={handleStart} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Enter your FaucetPay Email or Crypto Address
                </label>
                <input
                  type="text"
                  required
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="e.g. your@email.com or DAddress..."
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
        <AdBanner />
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center p-6 gap-6">
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
