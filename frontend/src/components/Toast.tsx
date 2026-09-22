'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Global toast system — professional title + subtitle cards with an animated
 * status icon (a "swirl → ring draws closed → mark pops" sequence).
 *
 * Usage:
 *   const toast = useToast();
 *   toast.success('Added 1× RELX to your draft order.');
 *   toast.error('Could not save the draft.');
 *   toast.info('Heads up...');
 *
 * You can override the bold title by passing a second argument:
 *   toast.success('Order submitted!', 'All set');
 *
 * Mount <ToastProvider> once near the app root (providers.tsx). It shows a
 * single notification in the top-right and auto-dismisses it after ~2.8s; a
 * new toast replaces the current one (only one is visible at a time globally).
 * It is rendered at the top level (never inside a drawer/panel), so toasts
 * can't be clipped by surrounding layout.
 */

type ToastKind = 'success' | 'error' | 'info';

const DEFAULT_TITLES: Record<ToastKind, string> = {
  success: 'Success',
  error: 'Something went wrong',
  info: 'Heads up',
};

const DURATION_MS = 2800;

// Optional inline action button (e.g. "Undo"). When present the toast lingers
// longer so the user has time to act, and clicking it runs `onClick` then
// dismisses the toast.
interface ToastAction {
  label: string;
  onClick: () => void;
}

// Extra options for a toast: an optional action button and a custom duration.
interface ToastOptions {
  title?: string;
  action?: ToastAction;
  durationMs?: number;
}

const ACTION_DURATION_MS = 8000;

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  title: string;
  action?: ToastAction;
  durationMs: number;
  // How many times this same notification fired in quick succession. Shown as
  // a "×N" badge so a burst (e.g. Approve All over 20 items) collapses into a
  // single toast that counts up instead of flashing 20 separate toasts.
  count: number;
}

interface ToastApi {
  success: (message: string, title?: string) => void;
  error: (message: string, title?: string) => void;
  info: (message: string, title?: string) => void;
  // Full-control variant used for action toasts (e.g. Undo). Existing
  // success/error/info calls are unchanged.
  show: (kind: ToastKind, message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  // Exactly one toast is ever visible (null = none). Coalescing rapid repeats
  // means a burst of identical notifications never bombards the user.
  const [toast, setToast] = useState<ToastItem | null>(null);

  const remove = useCallback((id: number) => {
    setToast((cur) => (cur && cur.id === id ? null : cur));
  }, []);

  const push = useCallback((kind: ToastKind, message: string, options?: ToastOptions) => {
    const durationMs = options?.durationMs ?? (options?.action ? ACTION_DURATION_MS : DURATION_MS);
    const title = options?.title ?? DEFAULT_TITLES[kind];

    setToast((cur) => {
      // COALESCE: if the same notification (kind + title + message) is already
      // showing, don't replace it with a fresh one — just bump its count and
      // give it a new id so its dismiss timer restarts. A rapid burst (e.g.
      // "Approve All" firing "Sale approved" 20×) becomes ONE toast that reads
      // "Sale approved ×20" instead of 20 toasts machine-gunning the corner.
      // Action toasts (e.g. Undo) never coalesce — each is distinct.
      if (
        cur &&
        !cur.action &&
        !options?.action &&
        cur.kind === kind &&
        cur.title === title &&
        cur.message === message
      ) {
        return { ...cur, id: nextId++, count: cur.count + 1, durationMs };
      }
      // Otherwise REPLACE whatever was showing — only one toast at a time.
      return { id: nextId++, kind, message, title, action: options?.action, durationMs, count: 1 };
    });
  }, []);

  const api: ToastApi = {
    success: (m, t) => push('success', m, { title: t }),
    error: (m, t) => push('error', m, { title: t }),
    info: (m, t) => push('info', m, { title: t }),
    show: (kind, m, options) => push(kind, m, options),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Single toast — fixed top-right, above everything, never clipped by
          layout. Top-right keeps it clear of the bottom-right floating Draft
          Order button on the staff pages. At most one toast exists at a time
          (see push); rapid repeats coalesce into it with a ×N count. */}
      <div className="pointer-events-none fixed top-4 right-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2.5">
        {toast && <ToastCard key={toast.id} toast={toast} onDismiss={() => remove(toast.id)} />}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Animated status icon. Renders an SVG whose ring strokes itself closed and
 * whose mark (check or X) draws in, preceded by a brief spinning "swirl" arc.
 * Success = green, error/info-as-error styling handled by the caller.
 */
function AnimatedStatusIcon({ kind }: { kind: ToastKind }) {
  const color =
    kind === 'success' ? '#22c55e' : kind === 'error' ? '#ef4444' : '#3b82f6';
  const glowClass =
    kind === 'error' ? 'toast-icon-glow-error' : 'toast-icon-glow-success';
  // The mark path: a check for success/info, an X for errors.
  const markPath =
    kind === 'error' ? 'M9 9 L15 15 M15 9 L9 15' : 'M8 12.5 L11 15.5 L16.5 9.5';

  return (
    <span className={`relative inline-flex h-6 w-6 shrink-0 ${glowClass}`}>
      <svg viewBox="0 0 24 24" className="h-6 w-6 toast-icon-pop" fill="none">
        {/* Stage 1: spinning swirl arc (fades out). */}
        <circle
          className="toast-icon-swirl"
          cx="12"
          cy="12"
          r="10"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="16 47"
          opacity="0.9"
        />
        {/* Stage 2: full ring draws itself closed. */}
        <circle
          className="toast-icon-ring"
          cx="12"
          cy="12"
          r="10"
          stroke={color}
          strokeWidth="2"
        />
        {/* Stage 3: mark (check or X) draws in. */}
        <path
          className="toast-icon-mark"
          d={markPath}
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [exiting, setExiting] = useState(false);

  const close = useCallback(() => {
    setExiting(true);
    // Wait for the exit animation before removing from the list.
    setTimeout(onDismiss, 220);
  }, [onDismiss]);

  useEffect(() => {
    const timer = setTimeout(close, toast.durationMs);
    return () => clearTimeout(timer);
  }, [close, toast.durationMs]);

  const ring =
    toast.kind === 'success'
      ? 'border-accent-green/30'
      : toast.kind === 'error'
      ? 'border-accent-red/30'
      : 'border-accent-blue/30';
  const bar =
    toast.kind === 'success'
      ? 'bg-accent-green'
      : toast.kind === 'error'
      ? 'bg-accent-red'
      : 'bg-accent-blue';

  return (
    <div
      className={`pointer-events-auto relative flex items-start gap-3 overflow-hidden rounded-xl border ${ring} bg-card-bg px-4 py-3.5 shadow-xl shadow-black/25 ${exiting ? 'toast-out' : 'toast-in'}`}
      role="status"
    >
      <span className="mt-0.5">
        <AnimatedStatusIcon kind={toast.kind} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold leading-tight text-text-primary">
          <span className="min-w-0 truncate">{toast.title}</span>
          {toast.count > 1 && (
            <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-text-secondary">×{toast.count}</span>
          )}
        </p>
        <p className="mt-0.5 text-sm leading-snug text-text-secondary break-words">{toast.message}</p>
        {toast.action && (
          <button
            onClick={() => { toast.action!.onClick(); close(); }}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-accent-blue/40 bg-accent-blue/10 px-3 py-1.5 text-xs font-semibold text-accent-blue transition hover:bg-accent-blue hover:text-white"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={close}
        className="-mr-1 shrink-0 rounded p-0.5 text-text-muted transition hover:text-text-primary"
        aria-label="Dismiss notification"
      >
        <X size={15} />
      </button>
      {/* Auto-dismiss progress bar. */}
      <span className="pointer-events-none absolute bottom-0 left-0 h-0.5 w-full opacity-60">
        <span
          className={`toast-progress block h-full w-full ${bar}`}
          style={{ animationDuration: `${toast.durationMs}ms` }}
        />
      </span>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Safe no-op fallback if used outside the provider (shouldn't happen).
    return { success: () => {}, error: () => {}, info: () => {}, show: () => {} };
  }
  return ctx;
}
