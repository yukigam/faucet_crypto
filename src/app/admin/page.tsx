'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Stats = {
  total_claims: number;
  successful_claims: number;
  blocked_attempts: number;
  unique_ips: number;
  unique_addresses: number;
  captcha_failures: number;
  ip_rate_blocks: number;
  recent_logs: Array<{
    faucetpay_address: string;
    ip_address: string;
    turnstile_passed: boolean;
    success: boolean;
    error_type: string | null;
    created_at: string;
  }>;
};

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/stats')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setStats(data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-950">
        <p className="text-gray-400">Loading analytics...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-gray-950 gap-4">
        <p className="text-red-400">{error}</p>
        <Link href="/" className="text-sm text-gray-400 hover:text-white">Back to Faucet</Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          <Link href="/" className="text-sm text-gray-400 hover:text-white">← Back to Faucet</Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard label="Total Claims" value={stats?.total_claims ?? 0} />
          <StatCard label="Successful" value={stats?.successful_claims ?? 0} color="green" />
          <StatCard label="Blocked Attempts" value={stats?.blocked_attempts ?? 0} color="red" />
          <StatCard label="Unique IPs" value={stats?.unique_ips ?? 0} color="blue" />
          <StatCard label="Unique Addresses" value={stats?.unique_addresses ?? 0} color="purple" />
          <StatCard label="Captcha Failures" value={stats?.captcha_failures ?? 0} color="yellow" />
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">Recent Activity (last 50)</h2>
          <div className="bg-gray-900 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800 text-gray-400">
                    <th className="px-3 py-2 text-left">Time</th>
                    <th className="px-3 py-2 text-left">Address</th>
                    <th className="px-3 py-2 text-left">IP</th>
                    <th className="px-3 py-2 text-center">Captcha</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th className="px-3 py-2 text-left">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {stats?.recent_logs.map((log, i) => (
                    <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/50">
                      <td className="px-3 py-2 text-gray-400 text-xs">
                        {new Date(log.created_at).toLocaleTimeString()}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs truncate max-w-[120px]">
                        {log.faucetpay_address}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{log.ip_address}</td>
                      <td className="px-3 py-2 text-center">
                        {log.turnstile_passed ? '✅' : '❌'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {log.success ? (
                          <span className="text-green-400">Success</span>
                        ) : (
                          <span className="text-red-400">Blocked</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-400">{log.error_type || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  const colorMap: Record<string, string> = {
    green: 'text-green-400',
    red: 'text-red-400',
    blue: 'text-blue-400',
    purple: 'text-purple-400',
    yellow: 'text-yellow-400',
  };

  return (
    <div className="bg-gray-900 rounded-xl p-4">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color ? colorMap[color] || 'text-white' : 'text-white'}`}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}
