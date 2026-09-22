'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useBrands, useProducts } from '@/lib/hooks';
import { useAuthStore } from '@/lib/store';
import { getApiErrorMessage } from '@/lib/api';
import { GridSkeleton } from '@/components/Skeleton';

function peso(n: number) {
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function StaffHomePage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const branchName = useAuthStore((s) => s.user?.branch?.name);
  const branchId = useAuthStore((s) => s.user?.branch?.id);
  const { data, isLoading, isError, error } = useBrands(debouncedSearch);
  const brands = data?.data ?? [];

  // Also fetch products when there's a search query (for cross-brand product
  // search). Pass branchId so the price shown in search results is the staff's
  // branch price, matching the selling page — not the global default.
  const { data: productData, isLoading: productsLoading } = useProducts({ search: debouncedSearch, branchId });
  const allProducts = productData?.data ?? [];

  // Only show products section if the search matches product names but not brand names
  const matchingProducts = useMemo(() => {
    if (!debouncedSearch.trim()) return [];
    return allProducts.filter((p) =>
      p.name.toLowerCase().includes(debouncedSearch.toLowerCase())
    );
  }, [allProducts, debouncedSearch]);

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <div>
      {branchName && (
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1">{branchName}</p>
      )}
      <h1 className="text-2xl font-bold text-text-primary mb-5">Brands</h1>

      <div className="mb-6 flex max-w-2xl items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search brands or products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input-border bg-input-bg py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-input-focus"
          />
        </div>
      </div>

      {isLoading ? (
        <GridSkeleton count={10} />
      ) : isError ? (
        <div className="py-16 text-center text-accent-red">{getApiErrorMessage(error)}</div>
      ) : (
        <>
          {/* Brand Grid */}
          {brands.length > 0 && (
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {brands.map((brand) => (
                <button
                  key={brand.id}
                  onClick={() => router.push(`/staff/brands/${brand.id}`)}
                  className="tile-hover group flex flex-col overflow-hidden rounded-xl border border-card-border bg-card-bg text-left shadow-sm hover:border-input-focus"
                >
                  {/* Solid (not translucent) background: a semi-transparent fill
                      (bg-white/5) was mis-clipped by iOS Safari on this rounded,
                      overflow-hidden, GPU-promoted tile, showing a hard vertical
                      "split" on iPhone. A solid color composites cleanly on iOS
                      and looks identical on desktop. */}
                  <div className="flex aspect-square items-center justify-center overflow-hidden bg-card-bg">
                    {brand.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={brand.coverImage} alt={brand.name} loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs text-text-muted">No Image Available</span>
                    )}
                  </div>
                  <div className="px-3 py-3 bg-surface-muted">
                    <p className="truncate text-sm font-semibold text-text-primary">{brand.name}</p>
                    <p className="text-xs text-text-secondary">{brand.productCount} product{brand.productCount === 1 ? '' : 's'}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Product Results (when searching) */}
          {debouncedSearch.trim() && matchingProducts.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-bold text-text-primary mb-4">Products</h2>
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {matchingProducts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => p.brand?.id ? router.push(`/staff/brands/${p.brand.id}`) : undefined}
                    className="tile-hover flex flex-col overflow-hidden rounded-xl border border-card-border bg-card-bg text-left shadow-sm hover:border-input-focus"
                  >
                    <div className="flex aspect-square items-center justify-center overflow-hidden bg-card-bg">
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs text-text-muted">No Image</span>
                      )}
                    </div>
                    <div className="px-3 py-3 bg-surface-muted">
                      <p className="truncate text-sm font-semibold text-text-primary" title={p.name}>{p.name}</p>
                      <p className="text-sm font-bold text-text-primary">{peso(p.sellingPrice)}</p>
                      <p className="text-xs text-text-secondary">{p.brand?.name ?? ''}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* No results */}
          {brands.length === 0 && matchingProducts.length === 0 && (
            <div className="py-16 text-center text-text-muted">No brands or products found.</div>
          )}
        </>
      )}
    </div>
  );
}
