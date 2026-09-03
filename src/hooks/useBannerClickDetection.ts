'use client';

import { useEffect, useRef } from 'react';

export const PTC_BANNER_ATTR = 'data-ptc-adsterra-banner';

/**
 * Detects genuine interaction with Adsterra banner slots (iframe mousedown,
 * focus blur while hovering, or click-through via window.open). Fires once.
 */
export function useBannerClickDetection(active: boolean, onDetected: () => void) {
  const onDetectedRef = useRef(onDetected);
  const firedRef = useRef(false);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    if (!active) return;
    firedRef.current = false;

    const getContainers = () =>
      Array.from(document.querySelectorAll<HTMLElement>(`[${PTC_BANNER_ATTR}]`));

    let pointerInside = false;

    const fire = () => {
      if (firedRef.current) return;
      firedRef.current = true;
      onDetectedRef.current();
    };

    const onPointerEnter = () => {
      pointerInside = true;
    };
    const onPointerLeave = () => {
      pointerInside = false;
    };

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName !== 'IFRAME') return;
      if (getContainers().some((c) => c.contains(target))) fire();
    };

    const onBlur = () => {
      if (pointerInside) fire();
    };

    const originalOpen = window.open.bind(window);
    const hookedOpen: typeof window.open = (...args) => {
      const activeEl = document.activeElement;
      const inBanner = getContainers().some((c) => c.contains(activeEl as Node));
      if (pointerInside || inBanner) fire();
      return originalOpen(...args);
    };

    const attachContainerListeners = () => {
      getContainers().forEach((c) => {
        c.addEventListener('pointerenter', onPointerEnter);
        c.addEventListener('pointerleave', onPointerLeave);
      });
    };

    const detachContainerListeners = () => {
      getContainers().forEach((c) => {
        c.removeEventListener('pointerenter', onPointerEnter);
        c.removeEventListener('pointerleave', onPointerLeave);
      });
    };

    // Banners mount after ad info loads — attach on next frame
    const attachId = requestAnimationFrame(() => {
      attachContainerListeners();
    });

    document.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('blur', onBlur);
    window.open = hookedOpen;

    return () => {
      cancelAnimationFrame(attachId);
      detachContainerListeners();
      document.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('blur', onBlur);
      window.open = originalOpen;
    };
  }, [active]);
}
