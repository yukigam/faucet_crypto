'use client';

import { useEffect, useRef } from 'react';

export type BannerConfig = {
  label: string;
  height: number;
} & (
  | { type: 'iframe'; src: string; iframeAttrs?: Record<string, string> }
  | { type: 'script'; src: string }
  | { type: 'image'; href: string; img: string }
  | { type: 'adsterra'; zoneKey: string; width: number }
);

// Adsterra's banner invocation pairs a page-global `atOptions` object with
// its invoke.js script, so two banners on one page would fight over the
// global. Each slot therefore renders inside its OWN about:blank iframe
// whose document gets its own atOptions + invoke.js pair written into it.
// Invoke host matches the domain shown in this account's dashboard snippet.
const ADSTERRA_INVOKE_HOST = 'www.highrevenueformat.com';

function AdsterraFrame({
  zoneKey,
  width,
  height,
  onAdLoad,
}: {
  zoneKey: string;
  width: number;
  height: number;
  onAdLoad?: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !zoneKey) return;
    if (frame.dataset.mounted === '1') return;
    frame.dataset.mounted = '1';
    const doc = frame.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(
      '<!doctype html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;background:transparent">' +
        `<script type="text/javascript">atOptions = { 'key': '${zoneKey}', 'format': 'iframe', 'height': ${height}, 'width': ${width}, 'params': {} };</script>` +
        `<script type="text/javascript" src="//${ADSTERRA_INVOKE_HOST}/${zoneKey}/invoke.js"></script>` +
        '</body></html>',
    );
    doc.close();
    onAdLoad?.();
  }, [zoneKey, width, height, onAdLoad]);

  return (
    <iframe
      ref={frameRef}
      title="Advertisement"
      width={width}
      height={height}
      scrolling="no"
      style={{ border: 0, display: 'block', maxWidth: '100%' }}
    />
  );
}

// Sandboxing keeps ad frames origin-isolated and unable to top-navigate the
// page or trigger downloads (a common malvertising vector) while still
// allowing their normal click-through behavior via popups.
const IFRAME_SANDBOX = 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox';

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
  // --- Adsterra display banners (PTC pages) ---------------------------------
  // All PTC placements share the account's banner zone key. Each frame is an
  // independent invocation that reports its own impression, so reusing one
  // key across several slots on the same page is supported. Split into
  // separate zones in the Adsterra dashboard later if you want per-placement
  // fill/revenue reporting.
  // Top of the PTC ad listing page (300x250 medium rectangle)
  ptcListTop: {
    type: 'adsterra',
    label: 'Advertisement',
    zoneKey: '300610e385d2a70ad59e28da7a70af3e',
    width: 300,
    height: 250,
  },
  // Injected every 10 ads in the PTC listing (300x100 leaderboard)
  ptcListInline: {
    type: 'adsterra',
    label: 'Advertisement',
    zoneKey: '300610e385d2a70ad59e28da7a70af3e',
    width: 300,
    height: 100,
  },
  // Watch/timer page — inside the viewing card and on the success screen
  ptcView: {
    type: 'adsterra',
    label: 'Advertisement',
    zoneKey: '300610e385d2a70ad59e28da7a70af3e',
    width: 300,
    height: 250,
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
            sandbox={IFRAME_SANDBOX}
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
        {config.type === 'adsterra' &&
          (config.zoneKey ? (
            <AdsterraFrame
              zoneKey={config.zoneKey}
              width={config.width}
              height={config.height}
              onAdLoad={markLoaded}
            />
          ) : (
            <div
              className="flex w-full flex-col items-center justify-center gap-1 border-2 border-dashed border-gray-500/50 rounded-lg px-3 py-4 text-center"
              style={{ minHeight: config.height }}
            >
              <span className="text-xs font-semibold text-gray-400">
                Adsterra {config.width}×{config.height} slot
              </span>
              <span className="text-[10px] text-gray-500">
                Paste this zone&apos;s banner key in src/components/AdSlot.tsx
              </span>
            </div>
          ))}
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
