'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/store';
import { refreshTokenQuietly } from '@/lib/api';

const HEARTBEAT_MS = 10 * 60 * 1000;

/** Visible online sessions keep their existing refresh cadence. Idle hidden tabs do no keepalive work. */
export function Heartbeat() {
  const loggedIn = useAuthStore(s => !!s.accessToken);
  useEffect(() => {
    if (!loggedIn) return;
    const timer = setInterval(() => {
      if (document.hidden || !navigator.onLine) return;
      // Refresh itself reaches the backend; a separate health ping is redundant.
      refreshTokenQuietly();
    }, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [loggedIn]);
  return null;
}
