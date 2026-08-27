'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'faucetpay_address';

type NavItem = {
  href: string;
  label: string;
  icon: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Faucet', icon: '🚰' },
  { href: '/ptc', label: 'PTC Ads', icon: '📺' },
];

export default function SidebarNav() {
  const pathname = usePathname();
  const [address, setAddress] = useState<string | null>(null);
  const [availableCount, setAvailableCount] = useState<number | null>(null);

  // Deferred into rAF so the first client render matches the server render
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setAddress(localStorage.getItem(STORAGE_KEY));
    });
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  const refreshCount = useCallback(async (addr: string | null) => {
    if (!addr) {
      setAvailableCount(null);
      return;
    }
    try {
      const res = await fetch(`/api/ptc/ads?address=${encodeURIComponent(addr)}`);
      const data = await res.json();
      const unviewed = Array.isArray(data.ads)
        ? data.ads.filter((ad: { viewed_today?: boolean }) => !ad.viewed_today).length
        : null;
      setAvailableCount(unviewed);
    } catch {
      setAvailableCount(null);
    }
  }, []);

  useEffect(() => {
    if (!address) return;
    refreshCount(address);
    const onFocus = () => refreshCount(address);
    window.addEventListener('focus', onFocus);
    const interval = setInterval(() => refreshCount(address), 30_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [address, pathname, refreshCount]);

  const badge = address && availableCount !== null && availableCount > 0
    ? String(availableCount)
    : null;

  return (
    <>
      {/* Desktop: fixed sidebar rail */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden md:flex w-56 flex-col gap-1 border-r border-gray-800 bg-gray-900/80 backdrop-blur-sm p-3">
        <Link href="/" className="flex items-center gap-2 px-3 py-3">
          <span className="text-xl">🚰</span>
          <span className="font-bold bg-gradient-to-r from-yellow-400 to-orange-500 text-transparent bg-clip-text">
            Crypto Faucet
          </span>
        </Link>
        {NAV_ITEMS.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-white border border-yellow-500/40'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span>{item.icon}</span>
                {item.label}
              </span>
              {item.href === '/ptc' && badge && (
                <span className="min-w-5 rounded-full bg-green-500 px-1.5 py-0.5 text-center text-[11px] font-bold text-gray-950">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
        <p className="mt-auto px-3 text-[10px] leading-relaxed text-gray-600">
          Visit PTC Ads to earn extra rewards.
        </p>
      </aside>

      {/* Mobile: compact horizontal strip */}
      <nav className="w-full max-w-md flex gap-2 md:hidden">
        {NAV_ITEMS.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white shadow-lg'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
              {item.href === '/ptc' && badge && (
                <span className="min-w-5 rounded-full bg-green-400 px-1.5 py-0.5 text-[11px] font-bold text-gray-950">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
