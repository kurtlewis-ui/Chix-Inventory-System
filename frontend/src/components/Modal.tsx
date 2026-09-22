'use client';

import { useEffect, type ReactNode } from 'react';

// Width presets. Default 'sm' keeps the historical max-w-md so every existing
// dialog is unchanged; wider sizes are opt-in (e.g. the Edit Sale modal, which
// has multi-column item rows). All are full-width on mobile and only widen from
// the `sm` breakpoint up, so phones stay comfortable.
type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-3xl',
};

interface ModalProps {
  // Optional; defaults to true. Most callers control visibility by
  // conditionally mounting (`{showX && <Modal .../>}`) and never pass `open`,
  // so defaulting to true keeps that pattern working while still allowing an
  // explicit `open={false}` to hide.
  open?: boolean;
  onClose: () => void;
  title: string;
  size?: ModalSize;
  children: ReactNode;
}

export function Modal({ open = true, onClose, title, size = 'sm', children }: ModalProps) {
  // Close on Escape key.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className={`glass relative w-full ${SIZE_CLASS[size]} rounded-2xl p-4 sm:p-6 shadow-2xl shadow-black/40 max-h-[90vh] overflow-y-auto`}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="min-w-0 truncate text-lg font-semibold text-text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1 text-2xl leading-none text-text-muted hover:text-text-primary hover:opacity-80 transition-colors"
          >
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
