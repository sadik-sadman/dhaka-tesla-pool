"use client";

import { useEffect, useRef } from "react";

/**
 * Runs one poll immediately, then schedules the next only after the current
 * callback has settled. This avoids setInterval overlap when the network is
 * slower than the interval. The callback ref keeps polling stable across
 * renders without restarting the timer whenever a page callback changes.
 */
export function useSerialPolling(callback: () => Promise<void>, intervalMs: number, enabled: boolean) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      // React Strict Mode mounts, cleans up, then mounts effects again in
      // development. Do not let the first mount's queued microtask issue a
      // ghost request after its cleanup has already run.
      if (cancelled) return;
      try {
        await callbackRef.current();
      } catch {
        // Page callbacks own their visible error/last-good-state behavior;
        // a failed tick must not permanently stop future polling.
      }
      if (!cancelled) timer = setTimeout(poll, intervalMs);
    };

    queueMicrotask(poll);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, intervalMs]);
}
