'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type AdBlockStatus = {
  brave: boolean;
  adblocker: boolean;
  detected: boolean;
  checking: boolean;
};

const AdBlockContext = createContext<AdBlockStatus>({
  brave: false,
  adblocker: false,
  detected: false,
  checking: true,
});

export function useAdBlock() {
  return useContext(AdBlockContext);
}

// Ad domains that adblocker extensions (uBlock, AdBlock, AdGuard, etc.) always block
const AD_DOMAINS = [
  'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
  'https://securepubads.g.doubleclick.net/tag/js/gpt.js',
];

// Class names that adblockers hide via element hiding rules
const BAIT_CLASSES = [
  'ad', 'ads', 'adsbox', 'ad-banner', 'ad-container', 'ad-slot',
  'ad_300x250', 'ad_728x90', 'ad_leaderboard', 'ad_banner',
  'pub_300x250', 'pub_728x90', 'text-ad', 'textAd', 'text_ad',
  'google_ads', 'google-ad', 'advertisement', 'advert',
  'ad-placeholder', 'ad-wrapper', 'advertise', 'sponsored',
];

function checkBaitElements(): Promise<boolean> {
  return new Promise((resolve) => {
    const bait = document.createElement('div');
    bait.className = BAIT_CLASSES.join(' ');
    bait.setAttribute('data-ad', '1');
    bait.innerHTML = '&nbsp;';
    bait.style.position = 'absolute';
    bait.style.left = '-9999px';
    bait.style.height = '250px';
    bait.style.width = '300px';
    document.body.appendChild(bait);

    // Give adblockers time to run their hiding rules
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const cs = getComputedStyle(bait);
        const rect = bait.getBoundingClientRect();
        const hidden =
          rect.height === 0 ||
          rect.width === 0 ||
          bait.offsetHeight === 0 ||
          bait.offsetWidth === 0 ||
          cs.display === 'none' ||
          cs.visibility === 'hidden' ||
          cs.opacity === '0';
        document.body.removeChild(bait);
        resolve(hidden);
      });
    });
  });
}

function checkBlockedDomain(): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (blocked: boolean) => {
      if (!resolved) {
        resolved = true;
        resolve(blocked);
      }
    };

    for (const domain of AD_DOMAINS) {
      const script = document.createElement('script');
      script.src = domain;
      script.async = true;
      script.onload = () => done(false);
      script.onerror = () => done(true);
      document.body.appendChild(script);
    }

    // If nothing loaded within 3s, treat as blocked (or extremely slow network)
    setTimeout(() => done(true), 3000);
  });
}

export function AdBlockProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AdBlockStatus>({
    brave: false,
    adblocker: false,
    detected: false,
    checking: true,
  });

  useEffect(() => {
    let cancelled = false;

    const checkBrave = async (): Promise<boolean> => {
      try {
        if (typeof navigator !== 'undefined' && (navigator as any).brave) {
          return await (navigator as any).brave.isBrave();
        }
      } catch {
        // ignore
      }
      return false;
    };

    Promise.all([checkBrave(), checkBaitElements(), checkBlockedDomain()])
      .then(([isBrave, baitBlocked, domainBlocked]) => {
        if (!cancelled) {
          setStatus({
            brave: isBrave,
            adblocker: baitBlocked || domainBlocked,
            detected: isBrave || baitBlocked || domainBlocked,
            checking: false,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdBlockContext.Provider value={status}>
      {children}
    </AdBlockContext.Provider>
  );
}
