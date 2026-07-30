'use client';

import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react';

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

const BAIT_URL = '/partner/ads.js'; // path that adblockers typically block

export function AdBlockProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AdBlockStatus>({
    brave: false,
    adblocker: false,
    detected: false,
    checking: true,
  });
  const baitRef = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const checkBrave = async () => {
      const isBrave = typeof navigator !== 'undefined' && (navigator as any).brave
        ? await (navigator as any).brave.isBrave().catch(() => false)
        : false;
      return isBrave;
    };

    const checkAdblocker = (): Promise<boolean> => {
      return new Promise((resolve) => {
        const bait = document.createElement('div');
        bait.innerHTML = '&nbsp;';
        bait.className = 'adsbox pub_300x250 pub_300x250m pub_728x90 text-ad textAd text_ad text_ads text-ads';
        bait.style.position = 'absolute';
        bait.style.left = '-9999px';
        bait.style.height = '250px';
        bait.style.width = '300px';
        document.body.appendChild(bait);

        // Also create a script element for the bait URL
        const script = document.createElement('script');
        script.src = BAIT_URL;
        script.async = true;
        script.onload = () => { /* loaded = not blocked */ };
        script.onerror = () => { /* blocked or error */ };
        document.body.appendChild(script);
        baitRef.current = script;

        // Give browsers a frame to apply styles
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const rect = bait.getBoundingClientRect();
            const isHidden = rect.height === 0 || rect.width === 0 || bait.offsetHeight === 0;
            document.body.removeChild(bait);
            resolve(isHidden);
          });
        });
      });
    };

    Promise.all([checkBrave(), checkAdblocker()]).then(([isBrave, adblock]) => {
      if (!cancelled) {
        setStatus({
          brave: isBrave,
          adblocker: adblock,
          detected: isBrave || adblock,
          checking: false,
        });
      }
    });

    return () => {
      cancelled = true;
      if (baitRef.current?.parentNode) {
        baitRef.current.parentNode.removeChild(baitRef.current);
      }
    };
  }, []);

  return (
    <AdBlockContext.Provider value={status}>
      {children}
    </AdBlockContext.Provider>
  );
}
