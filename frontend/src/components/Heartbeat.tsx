'use client';

import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/lib/store';
import { warmUpBackend, refreshTokenQuietly } from '@/lib/api';

const HEARTBEAT_MS = 10 * 60 * 1000; // 10 minutes

/**
 * While a user is logged in, every 10 minutes this:
 *  1) pings /health to keep the free-tier backend from sleeping, and
 *  2) proactively refreshes the auth token BEFORE it expires, which also
 *     slides the server session's idle window forward — so an idle tab (no
 *     clicks) doesn't get logged out the moment the user acts again.
 *
 * Renders nothing — mount once at the app root.
 */
export function Heartbeat() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!accessToken) {
      // Not logged in — stop pinging.
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initial ping on mount / login. (No token refresh here — we just logged
    // in / reloaded with a fresh token; refreshing starts on the interval.)
    warmUpBackend();

    // Every 10 minutes: keep the backend awake AND refresh the token so the
    // session never quietly expires under an idle tab.
    intervalRef.current = setInterval(() => {
      warmUpBackend();
      refreshTokenQuietly();
    }, HEARTBEAT_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [accessToken]);

  return null;
}
