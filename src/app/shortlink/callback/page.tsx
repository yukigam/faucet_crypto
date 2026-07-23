'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense, useEffect } from 'react';
import AdBanner from '@/components/AdBanner';

function CallbackContent() {
  const params = useSearchParams();
  const status = params.get('status');
  const reward = params.get('reward');
  const errorMsg = params.get('msg');
  const dailyClaims = params.get('daily_claims');
  const warning = params.get('warning');

  useEffect(() => {
    console.log('[SHORTLINK_PAGE] Received params:', Object.fromEntries(params.entries()));
  }, [params]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-8">
      <AdBanner />
      <div className="w-full max-w-md mx-auto overflow-hidden p-6 rounded-2xl bg-gradient-to-br from-purple-500 via-violet-500 to-indigo-600 shadow-xl">
        <div className="bg-white/90 backdrop-blur-sm rounded-xl p-6 space-y-4 text-center">
          {status === 'success' ? (
            <>
              <div className="text-5xl mb-2">🎉</div>
              <h1 className="text-2xl font-bold text-gray-900">Shortlink Completed!</h1>
              <p className="text-green-600 font-semibold text-lg">
                +{reward || '0.00005'} TON
              </p>
              {dailyClaims && (
                <p className="text-sm text-gray-500">
                  Today&apos;s shortlink claims: {dailyClaims}
                </p>
              )}
              {warning && (
                <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  {warning}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="text-5xl mb-2">❌</div>
              <h1 className="text-2xl font-bold text-gray-900">Something went wrong</h1>
              <p className="text-red-600 text-sm">{errorMsg || 'Unknown error'}</p>
            </>
          )}

          <Link
            href="/"
            className="inline-block w-full py-2.5 px-4 rounded-lg font-semibold text-sm bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:opacity-90 transition-opacity"
          >
            Back to Faucet
          </Link>
        </div>
      </div>
      <AdBanner />
    </main>
  );
}

export default function ShortlinkCallbackPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Verifying...</p>
      </main>
    }>
      <CallbackContent />
    </Suspense>
  );
}
