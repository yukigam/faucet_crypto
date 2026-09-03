'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

// The opened ad tab must stay open this long before the interaction counts.
// A visible countdown of these seconds is shown in the claim UIs.
export const AD_VIEW_SECONDS = 8;
const AD_VIEW_MS = AD_VIEW_SECONDS * 1_000;
const POLL_INTERVAL_MS = 250;
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
  /** Live countdown while checking: seconds left of the required view time. */
  secondsRemaining: number | null;
};

const defaultStatus: PopunderStatus = {
  verified: false,
  sustained: false,
  triggered: false,
  blocked: false,
  closedEarly: false,
  checking: false,
  secondsRemaining: null,
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
    const activeTimers: number[] = [];

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
        setStatus((s) => ({ ...s, blocked: true, triggered: false, checking: false, secondsRemaining: null }));
        return win;
      }
      if (!withinGesture) return win;

      setStatus((s) => ({
        ...s,
        triggered: true,
        blocked: false,
        closedEarly: false,
        checking: true,
        secondsRemaining: AD_VIEW_SECONDS,
      }));

      // Require the opened window to stay open (real ad session) —
      // if it is closed before the full view time, the interaction
      // does not count and the user must trigger the ad again
      const start = Date.now();
      const timer = window.setInterval(() => {
        const elapsed = Date.now() - start;
        if (win.closed) {
          clearInterval(timer);
          if (elapsed < AD_VIEW_MS) {
            setStatus((s) => ({
              ...s,
              checking: false,
              triggered: false,
              closedEarly: true,
              verified: false,
              secondsRemaining: null,
            }));
          }
        } else if (elapsed >= AD_VIEW_MS) {
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
            secondsRemaining: null,
          }));
        } else {
          const secs = Math.ceil((AD_VIEW_MS - elapsed) / 1000);
          setStatus((s) => (s.secondsRemaining === secs ? s : { ...s, secondsRemaining: secs }));
        }
      }, POLL_INTERVAL_MS);
      activeTimers.push(timer);
      timersRef.current.push(timer);
      return win;
    };

    (window as unknown as { open: typeof window.open }).open = hookedOpen;

    return () => {
      window.removeEventListener('pointerdown', onGesture, true);
      window.removeEventListener('keydown', onGesture, true);
      activeTimers.forEach((t) => clearInterval(t));
      (window as unknown as { open: typeof window.open }).open = originalOpen;
    };
  }, []);

  return <PopunderContext.Provider value={status}>{children}</PopunderContext.Provider>;
}
