'use client';

import { useCallback } from 'react';

/**
 * Guards a modal/form close against losing unsaved edits.
 *
 * Usage:
 *   const [dirty, setDirty] = useState(false);  // or derive from form state
 *   const guardedClose = useUnsavedGuard(dirty, onClose);
 *   ...pass guardedClose to the modal's onClose / backdrop / X / Cancel.
 *
 * When `dirty` is true, closing pops a native confirm() ("You have unsaved
 * changes. Discard them?"). If the user cancels, the close is aborted. When
 * not dirty, it closes immediately. A native confirm is used deliberately:
 * it's synchronous, works identically everywhere, and can't itself be
 * dismissed-and-lost like a custom modal-over-modal.
 */
export function useUnsavedGuard(dirty: boolean, close: () => void) {
  return useCallback(() => {
    if (dirty) {
      const ok = window.confirm('You have unsaved changes. Discard them?');
      if (!ok) return;
    }
    close();
  }, [dirty, close]);
}

/**
 * Preserve the window scroll position across an async action (e.g. saving an
 * edit that refetches a list). Captures scrollY, runs the action, then
 * restores scrollY on the next few frames so it survives the list re-render.
 *
 *   await withScrollPreserved(() => updateProduct.mutateAsync(...));
 */
export async function withScrollPreserved<T>(action: () => Promise<T>): Promise<T> {
  const y = typeof window !== 'undefined' ? window.scrollY : 0;
  const result = await action();
  if (typeof window !== 'undefined') {
    // Restore now and again after the refetch/re-render settles.
    const restore = () => window.scrollTo({ top: y });
    restore();
    requestAnimationFrame(restore);
    setTimeout(restore, 120);
  }
  return result;
}
