'use client';

import { useEffect } from 'react';

const SCRIPT_ID = 'adsterra-popunder-script';
const MOUNTED_ID = 'data-adsterra-popunder-mounted';

export default function AdsterraPopunder() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.documentElement.getAttribute(MOUNTED_ID) === '1') return;
    if (document.getElementById(SCRIPT_ID)) {
      document.documentElement.setAttribute(MOUNTED_ID, '1');
      return;
    }

    const s = document.createElement('script');
    s.id = SCRIPT_ID;
    s.src = 'https://pl30445321.effectivecpmnetwork.com/89/cb/2d/89cb2d8768fb0d2017d6d4ef194465a0.js';
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.referrerPolicy = 'no-referrer-when-downgrade';

    const cleanupId = window.setTimeout(() => {
      document.documentElement.setAttribute(MOUNTED_ID, '1');
    }, 0);

    document.head.appendChild(s);

    return () => {
      window.clearTimeout(cleanupId);
      // Strict-mount double-run: revert the guard so the real mount can run
      document.documentElement.removeAttribute(MOUNTED_ID);
    };
  }, []);

  return null;
}
