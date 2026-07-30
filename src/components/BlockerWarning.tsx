'use client';

import { useAdBlock } from '@/contexts/AdBlockContext';

export default function BlockerWarning() {
  const { detected, checking, brave, adblocker } = useAdBlock();

  if (checking || !detected) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md mx-auto overflow-hidden rounded-2xl bg-gradient-to-br from-red-500 via-orange-500 to-yellow-500 shadow-2xl animate-bounce-in">
        <div className="bg-white/95 backdrop-blur-sm rounded-xl p-6 space-y-4 text-center">
          <div className="text-5xl">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900">
            {brave ? 'Brave Shields Detected' : 'Ad Blocker Detected'}
          </h2>
          <p className="text-sm text-gray-600">
            {brave
              ? 'Brave Shields is blocking our ad network. This faucet relies on ad revenue to operate.'
              : 'An ad blocker is preventing ads from loading. This faucet relies on ad revenue to operate.'}
          </p>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm font-medium text-red-700">
              {brave
                ? 'Please disable Brave Shields for this site or use a standard browser (Chrome, Edge, Firefox) to claim rewards.'
                : 'Please disable your ad blocker for this site and refresh the page to claim rewards.'}
            </p>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
            <p className="text-sm text-orange-700 font-medium">
              🔒 Claim button is disabled until shields are turned off.
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm bg-gradient-to-r from-orange-500 to-red-500 text-white hover:opacity-90 transition-opacity"
          >
            Refresh & Check Again
          </button>
        </div>
      </div>
    </div>
  );
}
