'use client';

import { useEffect, useState } from 'react';
import { Search, Undo2, Loader2 } from 'lucide-react';
import {
  useBranches,
  useBranchArchivedProducts,
  useRestoreProductToBranch,
} from '@/lib/hooks';
import { getApiErrorMessage } from '@/lib/api';
import { Select } from '@/components/Select';
import { usePagination, Pagination } from '@/components/Pagination';
import { useStoredBranch } from '@/lib/useStoredBranch';

// Branch Product Archive: products that were removed from a SINGLE branch
// (per-branch archive), with a Restore action that brings each one back into
// that branch. This is separate from the global "Products Archive" page, which
// lists products archived across every branch.
export default function BranchProductsArchivePage() {
  const { data: branchData } = useBranches();
  const branches = branchData?.data ?? [];
  // Reuse the site-wide selected-branch memory so it lines up with the Products
  // page. '' means no shop chosen yet.
  const [branchId, setBranchId] = useStoredBranch(branches);

  const { data, isLoading, isError, error } = useBranchArchivedProducts(branchId || undefined);
  const restore = useRestoreProductToBranch();
  const products = data?.data ?? [];

  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const { pageItems: paged, resetPage, controlProps } = usePagination(filtered, 10);

  // Reset to page 1 when the branch or search changes.
  useEffect(() => { resetPage(); }, [branchId, search, resetPage]);

  const branchName = branches.find((b) => b.id === branchId)?.name ?? '';

  const handleRestore = async (productId: string) => {
    if (!branchId) return;
    setActionError(null);
    try { await restore.mutateAsync({ productId, branchId }); }
    catch (e) { setActionError(getApiErrorMessage(e)); }
  };

  return (
    <div className="p-6 bg-page-bg min-h-screen">
      <h1 className="text-2xl font-bold text-text-primary mb-1">Branch Product Archive</h1>
      <p className="text-sm text-text-muted mb-6">Products removed from a single shop. Restore brings a product back into that shop (its kept stock reappears).</p>
      {actionError && <div className="mb-4 rounded-lg bg-accent-red/10 border border-accent-red/30 px-4 py-2 text-sm text-accent-red">{actionError}</div>}

      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm">
        <div className="p-4 border-b border-card-border flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-text-secondary">Shop</label>
            <Select
              value={branchId}
              onChange={(v) => setBranchId(v)}
              ariaLabel="Shop"
              placeholder="Select a shop"
              className="w-auto min-w-[200px]"
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
            />
          </div>
          <div className="relative w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input type="text" placeholder="Search removed products..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 border border-input-border rounded-lg bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-input-focus" />
          </div>
        </div>

        {!branchId ? (
          <div className="px-4 py-12"><div className="border-l-4 border-accent-blue pl-4"><p className="text-text-secondary">Select a shop to see the products removed from it.</p></div></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="hidden w-full md:table">
              <thead>
                <tr className="bg-table-header text-table-header-text">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">#</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Brand</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={4} className="text-center py-8 text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading...</td></tr>
                ) : isError ? (
                  <tr><td colSpan={4} className="text-center py-8 text-accent-red">{getApiErrorMessage(error)}</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-12"><div className="border-l-4 border-accent-orange pl-4"><p className="text-accent-orange font-medium">No products removed from {branchName}.</p></div></td></tr>
                ) : paged.map((product, idx) => (
                  <tr key={product.id} className="border-b border-card-border transition">
                    <td className="px-4 py-3 text-sm text-text-primary">{controlProps.startIdx + idx + 1}</td>
                    <td className="px-4 py-3 text-sm text-text-primary font-medium">{product.name}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{product.brand?.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleRestore(product.id)} disabled={restore.isPending} className="inline-flex items-center gap-1 rounded-lg bg-accent-green/10 px-2.5 py-1 text-sm font-medium text-accent-green hover:bg-accent-green/20 transition-colors disabled:opacity-50" title={`Restore to ${branchName}`}>
                        <Undo2 size={14} /> Restore
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className="md:hidden">
              {isLoading ? (
                <div className="py-8 text-center text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading...</div>
              ) : isError ? (
                <div className="py-8 text-center text-accent-red">{getApiErrorMessage(error)}</div>
              ) : filtered.length === 0 ? (
                <div className="p-4"><div className="border-l-4 border-accent-orange pl-4"><p className="text-accent-orange font-medium">No products removed from {branchName}.</p></div></div>
              ) : (
                <ul className="divide-y divide-card-border">
                  {paged.map((product, idx) => (
                    <li key={product.id} className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary break-words"><span className="text-text-muted mr-1.5">{controlProps.startIdx + idx + 1}.</span>{product.name}</p>
                        <p className="text-xs text-text-secondary">{product.brand?.name ?? '—'}</p>
                      </div>
                      <button onClick={() => handleRestore(product.id)} disabled={restore.isPending} className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-accent-green/10 px-2.5 py-1.5 text-sm font-medium text-accent-green hover:bg-accent-green/20 transition-colors disabled:opacity-50" title={`Restore to ${branchName}`}>
                        <Undo2 size={14} /> Restore
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        {!!branchId && !isLoading && !isError && filtered.length > 0 && (
          <Pagination {...controlProps} noun="products" />
        )}
      </div>
    </div>
  );
}
