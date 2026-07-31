'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

const SUSTAIN_MS = 3_000;
const GESTURE_WINDOW_MS = 2_000;
const VERIFIED_WINDOW_MS = 30 * 60 * 1000;
const VERIFIED_KEY = 'popunder_verified_at';

type PopunderStatus = {
  verified: boolean;
  sustained: boolean;
  triggered: boolean;
  blocked: boolean;
  closedEarly: boolean;
  checking: boolean;
};

const defaultStatus: PopunderStatus = {
  verified: false,
  sustained: false,
  triggered: false,
  blocked: false,
  closedEarly: false,
  checking: false,
};

const PopunderContext = createContext<PopunderStatus>(defaultStatus);

export function usePopunder() {
  return useContext(PopunderContext);
}

function isVerifiedRecently(): boolean {
  try {
    const stored = Number(localStorage.getItem(VERIFIED_KEY));
    return Number.isFinite(stored) && Date.now() - stored < VERIFIED_WINDOW_MS;
  } catch {
    return false;
  }
}

export function PopunderProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<PopunderStatus>(() => ({
    ...defaultStatus,
    verified: typeof window !== 'undefined' && isVerifiedRecently(),
  }));

  const lastGestureRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const originalOpen = window.open.bind(window);

    // Page-level click/gesture listener — the popunder only counts as
    // genuine when it fires from a real user gesture on this page
    const onGesture = () => {
      lastGestureRef.current = Date.now();
    };
    window.addEventListener('pointerdown', onGesture, true);
    window.addEventListener('keydown', onGesture, true);

    // Hook window.open so we can see the Adsterra popunder actually
    // opening a new window/tab (a null result = popup blocker blocked it)
    const hookedOpen = (...args: Parameters<typeof window.open>) => {
      const withinGesture = Date.now() - lastGestureRef.current <= GESTURE_WINDOW_MS;
      const win = originalOpen(...args);
      if (!win) {
        setStatus((s) => ({ ...s, blocked: true, triggered: false, checking: false }));
        return win;
      }
      if (!withinGesture) return win;

      setStatus((s) => ({
        ...s,
        triggered: true,
        blocked: false,
        closedEarly: false,
        checking: true,
      }));

      // Require the opened window to stay open (real ad session) —
      // if it is closed immediately, the interaction does not count
      const start = Date.now();
      const timer = window.setInterval(() => {
        if (win.closed) {
          clearInterval(timer);
          if (Date.now() - start < SUSTAIN_MS) {
            setStatus((s) => ({
              ...s,
              checking: false,
              triggered: false,
              closedEarly: true,
              verified: false,
            }));
          }
        } else if (Date.now() - start >= SUSTAIN_MS) {
          clearInterval(timer);
          try {
            localStorage.setItem(VERIFIED_KEY, String(Date.now()));
          } catch {
            // ignore storage errors
          }
          setStatus((s) => ({
            ...s,
            checking: false,
            sustained: true,
            verified: true,
            closedEarly: false,
          }));
        }
      }, 400);
      timersRef.current.push(timer);
      return win;
    };

    (window as unknown as { open: typeof window.open }).open = hookedOpen;

    return () => {
      window.removeEventListener('pointerdown', onGesture, true);
      window.removeEventListener('keydown', onGesture, true);
      timersRef.current.forEach((t) => clearInterval(t));
      (window as unknown as { open: typeof window.open }).open = originalOpen;
    };
  }, []);

  return <PopunderContext.Provider value={status}>{children}</PopunderContext.Provider>;
}
