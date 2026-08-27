'use client';

import { useEffect, useRef } from 'react';

export type BannerConfig = {
  label: string;
  height: number;
} & (
  | { type: 'iframe'; src: string; iframeAttrs?: Record<string, string> }
  | { type: 'script'; src: string }
  | { type: 'image'; href: string; img: string }
);

// Central ad registry — paste each network's embed code here and reference
// the slot by key from any component. Create one zone per placement in each
// ad network's dashboard: separate zones report revenue and fill independently.
export const BANNERS = {
  // Existing A-ADS adaptive unit (same zone as the original AdBanner)
  adaptive: {
    type: 'iframe',
    label: 'Advertisement',
    src: '//acceptable.a-ads.com/2448525/?size=Adaptive',
    iframeAttrs: { 'data-aa': '2448525' },
    height: 90,
  },
  // Directly above the captcha — the highest-visibility slot on the page.
  // Replace with a dedicated 300x250 / adaptive square zone for best CPM.
  aboveClaim: {
    type: 'iframe',
    label: 'Advertisement',
    src: '//acceptable.a-ads.com/2448525/?size=Adaptive',
    iframeAttrs: { 'data-aa': '2448525' },
    height: 250,
  },
  // Sticky sidebar for wide screens (xl and up)
  sidebar: {
    type: 'iframe',
    label: 'Advertisement',
    src: '//acceptable.a-ads.com/2448525/?size=Adaptive',
    iframeAttrs: { 'data-aa': '2448525' },
    height: 600,
  },
  // Adsterra banner example (dashboard → Websites → Banners → get <script>):
  // footer: {
  //   type: 'script',
  //   label: 'Advertisement',
  //   src: 'https://pl00000000.effectivecpmnetwork.com/aa/bb/cc/dd/aabbccdd000000000000000000000000.js',
  //   height: 90,
  // },
  // BC.Game affiliate banner example (wrap your own ref link):
  // bcgame: {
  //   type: 'image',
  //   label: 'Sponsored',
  //   href: 'https://bc.game/i/your-ref-code/',
  //   img: 'https://bc.game/assets/banner-300x250.png',
  //   height: 250,
  // },
} satisfies Record<string, BannerConfig>;

export type BannerSlot = keyof typeof BANNERS;

export default function AdSlot({
  slot,
  onAdLoad,
  className,
}: {
  slot: BannerSlot;
  onAdLoad?: () => void;
  className?: string;
}) {
  // `as` widens past the satisfies-narrowed registry (active entries may all
  // be one variant, but commented-out script/image slots must stay valid)
  const config = BANNERS[slot] as BannerConfig;
  const hostRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (config.type !== 'script' || !hostRef.current) return;
    if (hostRef.current.dataset.mounted === '1') return;
    hostRef.current.dataset.mounted = '1';
    const s = document.createElement('script');
    s.src = config.src;
    s.async = true;
    hostRef.current.appendChild(s);
  }, [config]);

  const markLoaded = () => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    onAdLoad?.();
  };

  return (
    <div className={`w-full ${className ?? ''}`}>
      <p className="text-center text-[10px] font-medium uppercase tracking-widest text-gray-400 mb-1">
        {config.label}
      </p>
      <div
        className="flex w-full items-center justify-center overflow-hidden rounded-lg bg-black/10"
        style={{ minHeight: config.height }}
      >
        {config.type === 'iframe' && (
          <iframe
            title={config.label}
            src={config.src}
            onLoad={markLoaded}
            scrolling="no"
            {...config.iframeAttrs}
            style={{
              border: 0,
              padding: 0,
              width: '100%',
              height: `${config.height}px`,
              overflow: 'hidden',
              display: 'block',
            }}
          />
        )}
        {config.type === 'script' && <div ref={hostRef} className="w-full" />}
        {config.type === 'image' && (
          <a href={config.href} target="_blank" rel="noopener nofollow sponsored">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={config.img} alt={config.label} onLoad={markLoaded} style={{ maxWidth: '100%' }} />
          </a>
        )}
      </div>
    </div>
  );
}
