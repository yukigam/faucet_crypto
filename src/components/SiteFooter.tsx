import Link from 'next/link';
import { SITE_NAME, SUPPORT_EMAIL } from '@/lib/site';

const LINKS = [
  { href: '/terms', label: 'Terms of Service' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/faq', label: 'FAQ' },
  { href: '/support', label: 'Support' },
];

export default function SiteFooter() {
  return (
    <footer className="mt-auto w-full border-t border-gray-800 bg-gray-900/60">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-6 py-8 text-sm md:flex-row md:justify-between">
        <div className="flex items-center gap-2 text-gray-400">
          <span className="text-lg">🚰</span>
          <span className="font-semibold text-gray-300">{SITE_NAME}</span>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-gray-400 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="text-gray-500 transition-colors hover:text-white"
        >
          {SUPPORT_EMAIL}
        </a>
      </div>
      <p className="pb-6 text-center text-xs text-gray-600">
        © {new Date().getFullYear()} {SITE_NAME}. Rewards are paid via FaucetPay.
      </p>
    </footer>
  );
}
