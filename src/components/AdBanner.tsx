'use client';

import AdSlot from './AdSlot';

// Thin wrapper kept for existing call sites — delegates to the central
// ad registry in AdSlot.tsx. Prefer using <AdSlot slot="..." /> directly.
export default function AdBanner({ onAdLoad }: { onAdLoad?: () => void }) {
  return <AdSlot slot="adaptive" onAdLoad={onAdLoad} />;
}
