'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Loader2, Package } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import type { Pagination } from '@/lib/types';

export type RecordProduct = { key: string; name: string; brand: string };

type Props = {
  selected: RecordProduct | null;
  onSelect: (product: RecordProduct) => void;
  scope: { branchId?: string; startDate?: string; endDate?: string };
  disabled?: boolean;
};

/** Remote, paginated historical choices; fetched only while the picker is open. */
export function RecordProductSelect({ selected, onSelect, scope, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const listId = useId();
  useEffect(() => {
    if (search.trim() === query) return;
    const timer = setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search, query]);
  useEffect(() => {
    if (!open) return;
    searchInput.current?.focus();
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const result = useQuery({
    queryKey: ['sales', 'record-products', scope, query, page],
    queryFn: async ({ signal }) => (await api.get<{ data: RecordProduct[]; pagination: Pagination }>('/sales/record-products', {
      params: { ...scope, search: query || undefined, page, limit: 20 }, signal,
    })).data,
    enabled: open && !disabled, staleTime: 30_000,
  });
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <div ref={root} className="relative min-w-0" onKeyDown={e => {
    if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); close(); }
    if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const options = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
      if (!options.length) return;
      e.preventDefault();
      const current = options.indexOf(document.activeElement as HTMLButtonElement);
      options[(current + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length]?.focus();
    }
  }}>
    <span className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-text-secondary"><Package size={14} aria-hidden="true" />EXACT PRODUCT</span>
    <button ref={trigger} type="button" role="combobox" aria-label="Exact product" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} disabled={disabled} onClick={() => setOpen(v => !v)} className="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input-border bg-input-bg px-3 py-2 text-left text-sm text-text-primary disabled:opacity-50">
      <span className="min-w-0 break-words">{selected ? selected.name : 'Choose an exact product…'}</span><ChevronDown size={16} aria-hidden="true" className="shrink-0 text-text-muted" />
    </button>
    {open && <div className="absolute left-0 right-0 top-full z-40 mt-1 rounded-lg border border-card-border bg-card-bg p-2 shadow-xl">
      <input ref={searchInput} type="search" aria-label="Search exact products" placeholder="Search historical products or brands…" value={search} onChange={e => setSearch(e.target.value)} className="min-h-11 w-full min-w-0 rounded-lg border border-input-border bg-input-bg px-3 text-sm text-text-primary" />
      <div className="mt-2 max-h-64 overflow-y-auto" id={listId} role="listbox" aria-label="Historical products">
        {result.isLoading || search.trim() !== query ? <p role="status" className="p-3 text-sm text-text-muted"><Loader2 size={14} className="mr-2 inline animate-spin" />Loading products…</p>
          : result.isError ? <div role="alert" className="p-3 text-sm text-accent-red">{getApiErrorMessage(result.error)} <button type="button" className="underline" onClick={() => result.refetch()}>Retry</button></div>
          : !result.data?.data.length ? <p role="status" className="p-3 text-sm text-text-muted">No products with approved sales in these filters.</p>
          : result.data.data.map(product => <button key={product.key} type="button" role="option" aria-selected={selected?.key === product.key} onClick={() => { onSelect(product); close(); }} className="flex min-h-11 w-full items-start justify-between gap-2 rounded-md px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-muted focus:bg-surface-muted focus:outline-none">
            <span className="min-w-0"><span className="block break-words font-medium">{product.name}</span><span className="block break-words text-xs text-text-muted">{product.brand} · {product.key.startsWith('snapshot:') ? 'Historical record' : `ID ${product.key.slice(-8)}`}</span></span>
            {selected?.key === product.key && <Check size={16} aria-hidden="true" className="shrink-0" />}
          </button>)}
      </div>
      {result.data && <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-card-border pt-2 text-xs text-text-secondary">
        <span>{result.data.pagination.total} matching products · Page {page} of {result.data.pagination.totalPages}</span>
        <div className="flex gap-2"><button type="button" aria-label="Previous product choices" disabled={!result.data.pagination.hasPrev || result.isFetching || search.trim() !== query} onClick={() => setPage(p => p - 1)} className="btn-secondary disabled:opacity-40">Previous</button><button type="button" aria-label="Next product choices" disabled={!result.data.pagination.hasNext || result.isFetching || search.trim() !== query} onClick={() => setPage(p => p + 1)} className="btn-secondary disabled:opacity-40">Next</button></div>
      </div>}
    </div>}
  </div>;
}
