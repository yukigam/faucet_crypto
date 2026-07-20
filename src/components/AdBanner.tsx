'use client';

interface AdBannerProps {
  position: 'top' | 'sidebar' | 'below-claim';
}

export default function AdBanner({ position }: AdBannerProps) {
  const sizeClasses = {
    top: 'w-full h-24',
    sidebar: 'w-full h-64',
    'below-claim': 'w-full h-20',
  };

  return (
    <div
      className={`${sizeClasses[position]} flex items-center justify-center bg-gray-800/50 border-2 border-dashed border-gray-600 rounded-lg`}
    >
      <p className="text-gray-500 text-sm font-medium">
        Ad Space — Paste your A-Ads / Coinzilla code here
      </p>
    </div>
  );
}
