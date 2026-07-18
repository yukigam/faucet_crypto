'use client';

import { useAuth } from '@/contexts/AuthContext';
import AuthForm from '@/components/AuthForm';
import FaucetClaim from '@/components/FaucetClaim';
import ReferralDashboard from '@/components/ReferralDashboard';

export default function Home() {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400 text-lg">Loading...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-8">
        <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
          Crypto Faucet
        </h1>
        <p className="text-gray-400 -mt-4">Sign in to claim free coins</p>
        <AuthForm />
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-center p-6 gap-6">
      <div className="w-full max-w-md flex items-center justify-between">
        <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
          Crypto Faucet
        </h1>
        <button
          onClick={signOut}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          Sign Out
        </button>
      </div>

      <p className="text-gray-400 -mt-3">{user.email}</p>

      <FaucetClaim />
      <ReferralDashboard />
    </main>
  );
}
