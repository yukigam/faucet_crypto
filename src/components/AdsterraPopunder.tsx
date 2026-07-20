'use client';

import { useEffect } from 'react';

export default function AdsterraPopunder() {
  useEffect(() => {
    const s = document.createElement('script');
    s.src = 'https://pl30445321.effectivecpmnetwork.com/89/cb/2d/89cb2d8768fb0d2017d6d4ef194465a0.js';
    s.async = true;
    document.body.appendChild(s);
  }, []);

  return null;
}
