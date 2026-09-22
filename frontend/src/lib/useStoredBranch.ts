'use client';

import { useEffect } from 'react';
import { useSelectedBranchStore } from './store';

interface BranchLike {
  id: string;
}

/**
 * Shared "currently-selected branch" for the owner/admin page-level branch
 * filters (Pending Sales, Sales Records, Disposals, Products, dashboard
 * Profit & Loss). Backed by a persisted Zustand store, so the branch you pick
 * on one page survives a refresh and follows you to the other filter pages —
 * instead of resetting to the first branch / "All Shops" every time.
 *
 * Options:
 *   - branches:   the live branch list (used to validate the stored id).
 *   - allowAll:   when true (default), '' is a valid value meaning "All Shops".
 *                 When false, an empty/invalid stored id auto-resolves to the
 *                 first available branch (for pages that must always target one
 *                 branch, e.g. Pending Sales).
 *
 * Returns [branchId, setBranchId] with the same shape as useState, so call
 * sites can drop it in where a local useState('') used to be.
 *
 * Validation: if the stored branch no longer exists (deleted/renamed away),
 * it falls back to '' (All Shops) when allowAll, otherwise to the first branch.
 * This is a filter only — it never persists a branch that isn't real.
 */
export function useStoredBranch(
  branches: BranchLike[] | undefined,
  options?: { allowAll?: boolean },
): [string, (branchId: string) => void] {
  const allowAll = options?.allowAll ?? true;
  const branchId = useSelectedBranchStore((s) => s.branchId);
  const setBranchId = useSelectedBranchStore((s) => s.setBranchId);

  useEffect(() => {
    // Wait until the branch list has loaded before reconciling — an empty list
    // mid-load must not clobber a valid stored branch.
    if (!branches || branches.length === 0) return;

    const exists = branchId !== '' && branches.some((b) => b.id === branchId);

    if (!exists) {
      if (allowAll) {
        // Only normalize a *stale* non-empty id back to All Shops; a genuine
        // '' (All Shops) selection is left alone.
        if (branchId !== '') setBranchId('');
      } else {
        // This page needs a concrete branch — pick the first one.
        setBranchId(branches[0].id);
      }
    }
  }, [branches, branchId, allowAll, setBranchId]);

  return [branchId, setBranchId];
}
