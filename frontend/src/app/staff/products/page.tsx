'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useBrands, useProducts } from '@/lib/hooks';
import { Select } from '@/components/Select';
import { useAuthStore } from '@/lib/store';
import { getApiErrorMessage } from '@/lib/api';

function peso(n: number) {
  return `\u20B1${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const PAGE_SIZES = [10, 25, 50, 'All'] as const;
type PageSize = (typeof PAGE_SIZES)[number];
// Backend caps a page at 200; "All" requests that max so every product shows
// on one page.
const ALL_LIMIT = 200;

export default function StaffProductsPage() {
  const [brandId, setBrandId] = useState('');
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [page, setPage] = useState(1);

  const user = useAuthStore((s) => s.user);
  const branchId = user?.branch?.id;

  const { data: brandData } = useBrands();
  const brands = brandData?.data ?? [];

  const isAll = pageSize === 'All';
  const effectiveLimit = isAll ? ALL_LIMIT : pageSize;

  const { data, isLoading, isError, error } = useProducts({
    branchId,
    brandId: brandId || undefined,
    search: search || undefined,
    page: isAll ? 1 : page,
    limit: effectiveLimit,
  });
  const products = data?.data ?? [];
  const pagination = data?.pagination;
  const totalPages = isAll ? 1 : (pagination?.totalPages ?? 1);
  const total = pagination?.total ?? products.length;

  const startIndex = total === 0 ? 0 : isAll ? 1 : (page - 1) * effectiveLimit + 1;
  const endIndex = isAll ? total : Math.min(page * effectiveLimit, total);

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary mb-4">Products</h1>

      <div className="mb-4 max-w-sm">
        <Select value={brandId} onChange={(v) => { setBrandId(v); setPage(1); }} ariaLabel="Brand filter" className="w-full" options={[{ value: '', label: 'All Brands' }, ...brands.map((b) => ({ value: b.id, label: b.name }))]} />
      </div>

      <div className="rounded-xl border border-card-border bg-card-bg shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            Show
            <Select value={String(pageSize)} onChange={(v) => { setPageSize(v === 'All' ? 'All' : (Number(v) as PageSize)); setPage(1); }} ariaLabel="Entries per page" className="w-auto min-w-[80px]" options={PAGE_SIZES.map((s) => ({ value: String(s), label: String(s) }))} />
            entries
          </label>
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-56 rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-input-focus"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="hidden w-full md:table">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase w-12">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase w-20">Image</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Quantity</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Brand</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Selling Price</th>
              </tr>
            </thead>
            <tbody>
              {!branchId ? (
                <tr><td colSpan={6} className="py-10 text-center text-accent-orange">Your account is not assigned to a shop. Ask an admin to assign one.</td></tr>
              ) : isLoading ? (
                <tr><td colSpan={6} className="py-10 text-center text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading products...</td></tr>
              ) : isError ? (
                <tr><td colSpan={6} className="py-10 text-center text-accent-red">{getApiErrorMessage(error)}</td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={6} className="py-10 text-center text-text-muted">No products found.</td></tr>
              ) : (
                products.map((p, i) => (
                  <tr key={p.id} className="border-t border-card-border transition">
                    <td className="px-4 py-3 text-sm text-accent-blue font-medium">{startIndex + i}</td>
                    <td className="px-4 py-3">
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt={p.name} loading="lazy" className="h-10 w-10 rounded object-cover bg-white/10" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded bg-white/10 text-[9px] text-text-muted">No Img</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">{p.name}</td>
                    <td className={`px-4 py-3 text-sm ${p.totalQuantity <= 0 ? 'text-accent-red font-medium' : p.totalQuantity <= (p.quantityAlert || 5) ? 'text-accent-orange font-medium' : 'text-text-primary'}`}>
                      {p.totalQuantity}
                      {p.totalQuantity <= 0 && <span className="ml-1 text-[10px]">(Out)</span>}
                      {p.totalQuantity > 0 && p.totalQuantity <= (p.quantityAlert || 5) && <span className="ml-1 text-[10px]">(Low)</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{p.brand?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-text-primary">{peso(p.sellingPrice)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Mobile: product cards (hidden on desktop). */}
          <div className="md:hidden">
            {!branchId ? (
              <div className="py-10 text-center text-accent-orange">Your account is not assigned to a shop. Ask an admin to assign one.</div>
            ) : isLoading ? (
              <div className="py-10 text-center text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading products...</div>
            ) : isError ? (
              <div className="py-10 text-center text-accent-red">{getApiErrorMessage(error)}</div>
            ) : products.length === 0 ? (
              <div className="py-10 text-center text-text-muted">No products found.</div>
            ) : (
              <ul className="divide-y divide-card-border">
                {products.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-3 p-4">
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt={p.name} loading="lazy" className="h-12 w-12 shrink-0 rounded object-cover bg-white/10" />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-white/10 text-[9px] text-text-muted">No Img</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary break-words">
                        <span className="text-accent-blue mr-1.5">{startIndex + i}.</span>{p.name}
                      </p>
                      <p className="text-xs text-text-secondary">{p.brand?.name ?? '—'} · {peso(p.sellingPrice)}</p>
                    </div>
                    <span className={`shrink-0 text-sm ${p.totalQuantity <= 0 ? 'text-accent-red font-medium' : p.totalQuantity <= (p.quantityAlert || 5) ? 'text-accent-orange font-medium' : 'text-text-primary'}`}>
                      {p.totalQuantity}
                      {p.totalQuantity <= 0 && <span className="ml-1 text-[10px]">(Out)</span>}
                      {p.totalQuantity > 0 && p.totalQuantity <= (p.quantityAlert || 5) && <span className="ml-1 text-[10px]">(Low)</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-card-border p-4">
          <p className="text-sm text-text-muted">
            Showing {startIndex} to {endIndex} of {total} products
          </p>
          {!isAll && totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg px-3 py-1.5 text-sm text-text-secondary hover:opacity-80 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="rounded-lg bg-btn-primary px-3 py-1.5 text-sm font-medium text-btn-primary-text">{page}</span>
              <span className="px-1 text-sm text-text-muted">/ {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg px-3 py-1.5 text-sm text-text-secondary hover:opacity-80 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
