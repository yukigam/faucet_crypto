'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type PtcWatchPauseReason = 'focus' | null;

function isPageActive(): boolean {
  return !document.hidden && document.hasFocus();
}

type UsePtcWatchTimerOptions = {
  token: string | null;
  duration: number;
  /** Session is in the watching phase */
  enabled: boolean;
  initialActiveSeconds: number;
  onComplete: () => void;
};

/**
 * PTC watch countdown that only advances while the tab is visible AND the
 * window has focus. Switching tabs or minimizing pauses it instantly and it
 * resumes on return. Each active second is recorded server-side via
 * /api/ptc/watch-tick so rewards cannot complete in the background.
 */
export function usePtcWatchTimer({
  token,
  duration,
  enabled,
  initialActiveSeconds,
  onComplete,
}: UsePtcWatchTimerOptions) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, duration - initialActiveSeconds),
  );
  const [pageActive, setPageActive] = useState(true);
  const completeFiredRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const resetCompletion = useCallback(() => {
    completeFiredRef.current = false;
  }, []);

  // Re-sync when session data loads from the server (deferred to avoid
  // synchronous setState inside an effect body).
  useEffect(() => {
    const value = Math.max(0, duration - initialActiveSeconds);
    queueMicrotask(() => setSecondsLeft(value));
  }, [duration, initialActiveSeconds]);

  // Pause when the user switches tabs or the window loses focus
  useEffect(() => {
    if (!enabled) return;

    const update = () => setPageActive(isPageActive());

    document.addEventListener('visibilitychange', update);
    window.addEventListener('blur', update);
    window.addEventListener('focus', update);
    update();

    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('blur', update);
      window.removeEventListener('focus', update);
    };
  }, [enabled]);

  const pauseReason: PtcWatchPauseReason = !pageActive ? 'focus' : null;

  const ticking =
    enabled && pageActive && secondsLeft > 0 && token !== null;

  useEffect(() => {
    if (!ticking || !token) return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch('/api/ptc/watch-tick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (cancelled) return;

        if (res.ok && data.success) {
          const remaining = typeof data.remaining === 'number' ? data.remaining : 0;
          setSecondsLeft(remaining);
          if (remaining <= 0 && !completeFiredRef.current) {
            completeFiredRef.current = true;
            onCompleteRef.current();
          }
        }
      } catch {
        // Retry on the next interval — inactive time is not credited
      }
    };

    const id = setInterval(() => {
      void tick();
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ticking, token]);

  const progress =
    duration > 0 ? ((duration - secondsLeft) / duration) * 100 : 0;

  return {
    secondsLeft,
    pauseReason,
    isPaused: pauseReason !== null,
    progress,
    resetCompletion,
    syncRemaining: (activeSeconds: number) => {
      setSecondsLeft(Math.max(0, duration - activeSeconds));
    },
  };
}
