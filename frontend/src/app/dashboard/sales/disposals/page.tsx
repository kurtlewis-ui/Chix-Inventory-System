'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Plus, X, Loader2, Store, Clock3, CalendarDays, Filter } from 'lucide-react';
import { useDisposals, useCreateDisposal, useBranches, useProducts } from '@/lib/hooks';
import { useAuthStore } from '@/lib/store';
import { getApiErrorMessage } from '@/lib/api';
import { Pagination } from '@/components/Pagination';
import { Select } from '@/components/Select';
import { DateTimeStack } from '@/components/DateTimeStack';
import { ProductThumb } from '@/components/ProductThumb';
import { NumberStepper } from '@/components/NumberStepper';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { msUntilNextBusinessDay, phQuickRangeDates, type QuickRange } from '@/lib/business-day';
import { RecordProductSelect, type RecordProduct } from '@/components/RecordProductSelect';

function peso(n: number) {
  return `\u20B1${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function DisposalsPage() {
  // The Disposals page is removed for Admin — redirect them to their landing
  // page if they reach this route directly. (Owner keeps full access.)
  const role = useAuthStore(s => s.user?.role?.name);
  const isAdmin = role === 'Admin';
  const isOwner = role === 'Owner';
  const router = useRouter();
  useEffect(() => {
    if (isAdmin) router.replace('/dashboard/sales/pending');
  }, [isAdmin, router]);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showModal, setShowModal] = useState(false);

  const [reason, setReason] = useState('');
  const [debouncedReason, setDebouncedReason] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<RecordProduct | null>(null);
  const [selectedShop, setSelectedShop] = useState('');
  const [period, setPeriod] = useState<QuickRange | 'custom'>('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const resetPage = () => setPage(1);
  useEffect(() => {
    if (search.trim() === debouncedSearch && reason.trim() === debouncedReason) return;
    const timer = setTimeout(() => { setDebouncedSearch(search.trim()); setDebouncedReason(reason.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search, debouncedSearch, reason, debouncedReason]);
  useEffect(() => {
    if (period === 'all' || period === 'custom') return;
    let timer: ReturnType<typeof setTimeout>;
    const sync = () => {
      clearTimeout(timer);
      const dates = phQuickRangeDates(period);
      setStartDate(dates.start); setEndDate(dates.end); setPage(1);
      timer = setTimeout(sync, msUntilNextBusinessDay());
    };
    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
    sync(); document.addEventListener('visibilitychange', onVisible);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [period]);
  const { data: branchData } = useBranches();
  const branches = branchData?.data ?? [];
  const invalidDates = period === 'custom' && (!startDate || !endDate) ? 'Choose both From and To dates.'
    : startDate && endDate && startDate > endDate ? 'From date must be on or before To date.' : '';
  const waitingForSearch = search.trim() !== debouncedSearch || reason.trim() !== debouncedReason;
  const { data, isLoading: queryLoading, isFetching, isError, error } = useDisposals({
    status: 'APPROVED', page, limit, productKey: selectedProduct?.key,
    search: debouncedSearch || undefined, reason: debouncedReason || undefined,
    branchId: selectedShop || undefined, startDate: startDate || undefined, endDate: endDate || undefined,
  }, isOwner && !invalidDates && !waitingForSearch);
  const isLoading = queryLoading || !!invalidDates || waitingForSearch;
  const disposals = data?.data ?? [];
  const pagedDisposals = disposals;
  const summary = data?.summary ?? { totalQuantity: 0, totalValue: 0, count: 0 };
  const total = data?.pagination?.total ?? 0, totalPages = data?.pagination?.totalPages ?? 1;
  useEffect(() => {
    if (!isFetching && !isError && data?.pagination && page > totalPages) setPage(totalPages);
  }, [data?.pagination, isFetching, isError, page, totalPages]);
  const controlProps = { page, totalPages, total, startIdx: (page - 1) * limit, shown: disposals.length, disabled: isFetching || waitingForSearch,
    onPrev: () => setPage(p => Math.max(1, p - 1)), onNext: () => setPage(p => Math.min(totalPages, p + 1)) };
  function choosePeriod(value: string) {
    const next = value as QuickRange;
    setPeriod(next); const dates = phQuickRangeDates(next);
    setStartDate(dates.start); setEndDate(dates.end); resetPage();
  }
  function clearFilters() {
    setSelectedShop(''); setSelectedProduct(null); setSearch(''); setDebouncedSearch('');
    setReason(''); setDebouncedReason(''); setPeriod('all'); setStartDate(''); setEndDate(''); resetPage();
  }
  if (!isOwner) return null;

  return (
    <div className="min-h-screen min-w-0 bg-page-bg p-4 sm:p-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-text-primary">Disposal Records</h1>
        <div className="flex flex-wrap gap-2"><button onClick={clearFilters} className="min-h-11 rounded-lg border border-input-border px-3 text-sm text-text-primary hover:opacity-80">Clear Filter</button>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 btn-grad px-4 py-2 rounded-lg text-sm font-medium">
          <Plus size={16} /> Request Disposal
        </button></div>
      </div>
      <p className="text-sm text-text-muted mb-6">Approved disposals (stock that has been written off). New requests go to <strong>Sales → Pending</strong> for approval.</p>

      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm mb-4">
        <div className="grid grid-cols-1 items-end gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="min-w-0"><span className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-text-secondary"><Store size={14} aria-hidden="true" />SHOPS</span>
            <Select value={selectedShop} onChange={v => { setSelectedShop(v); resetPage(); }} ariaLabel="Shop" options={[{ value: '', label: 'All Shops' }, ...branches.map(b => ({ value: b.id, label: b.name }))]} />
          </div>
          <div className="min-w-0"><span className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-text-secondary"><Clock3 size={14} aria-hidden="true" />PERIOD</span>
            <Select value={period === 'custom' ? '' : period} placeholder="Manual dates" onChange={choosePeriod} ariaLabel="Period" options={[
              { value: 'today', label: 'Daily — Today' }, { value: 'week', label: 'Weekly — This Week' },
              { value: 'month', label: 'Monthly — This Month' }, { value: 'year', label: 'Yearly — This Year' },
              { value: 'all', label: 'All Time' },
            ]} />
          </div>
          <label className="min-w-0"><span className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-text-secondary"><CalendarDays size={14} aria-hidden="true" />FROM</span>
            <input aria-label="From" type="date" value={startDate} onChange={e => { setPeriod('custom'); setStartDate(e.target.value); resetPage(); }} className="min-h-11 w-full min-w-0 rounded-lg border border-input-border bg-input-bg px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-input-focus" />
          </label>
          <label className="min-w-0"><span className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-text-secondary"><CalendarDays size={14} aria-hidden="true" />TO</span>
            <input aria-label="To" type="date" value={endDate} onChange={e => { setPeriod('custom'); setEndDate(e.target.value); resetPage(); }} className="min-h-11 w-full min-w-0 rounded-lg border border-input-border bg-input-bg px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-input-focus" />
          </label>
        </div>
        {invalidDates && <p role="status" className="px-4 pb-4 text-sm text-accent-orange">{invalidDates}</p>}
      </div>

      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm">
        <div className="grid grid-cols-1 items-end gap-4 border-b border-card-border p-4 lg:grid-cols-3">
          <div className="min-w-0"><span className="mb-2 block text-xs font-semibold tracking-wide text-text-secondary">SEARCH RECORDS</span><div className="relative"><Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" /><input type="search" aria-label="Search disposal records" placeholder="Search products, brands or reasons…" value={search} onChange={e => { setSelectedProduct(null); setSearch(e.target.value); }} className="min-h-11 w-full min-w-0 rounded-lg border border-input-border bg-input-bg pl-9 pr-3 text-sm text-text-primary" /></div></div>
          <RecordProductSelect source="disposals" key={selectedShop + '/' + startDate + '/' + endDate + '/' + debouncedReason} selected={selectedProduct} disabled={!!invalidDates || waitingForSearch} scope={{ branchId: selectedShop || undefined, startDate: startDate || undefined, endDate: endDate || undefined, reason: debouncedReason || undefined }} onSelect={product => { setSelectedProduct(product); setSearch(''); setDebouncedSearch(''); resetPage(); }} />
          <label className="min-w-0"><span className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-text-secondary"><Filter size={14} aria-hidden="true" />REASON</span><input type="search" aria-label="Reason filter" value={reason} onChange={e => setReason(e.target.value)} placeholder="Any reason — e.g. Damaged, Expired" className="min-h-11 w-full min-w-0 rounded-lg border border-input-border bg-input-bg px-3 text-sm text-text-primary" /></label>
        </div>
        <div aria-label="Active disposal filters" className="flex flex-wrap items-center gap-2 border-b border-card-border px-4 py-3 text-xs text-text-secondary">
          <span className="max-w-full break-words font-medium text-text-primary">{selectedProduct ? selectedProduct.name + ' (' + selectedProduct.brand + ')' : debouncedSearch ? 'Search: ' + debouncedSearch : 'All products'}</span>
          <span>· {branches.find(b => b.id === selectedShop)?.name ?? 'All Shops'} · {startDate && endDate ? startDate + ' – ' + endDate : 'All Time'} · {debouncedReason ? 'Reason: ' + debouncedReason : 'All reasons'}</span>
          {selectedProduct && <button type="button" onClick={() => { setSelectedProduct(null); resetPage(); }} className="rounded-md border border-input-border px-2 py-1 text-text-primary hover:bg-surface-muted">Clear Product</button>}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-card-border px-4 py-3 text-sm text-text-secondary"><span>Rows</span><div className="w-24 shrink-0"><Select ariaLabel="Disposal records rows per page" value={String(limit)} onChange={value => { setLimit(Number(value)); resetPage(); }} options={[10, 25, 50, 100].map(value => ({ value: String(value), label: String(value) }))} /></div><span className="text-xs text-text-muted">records per page</span></div>
        <div className="overflow-x-auto">
          <table className="hidden w-full md:table">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Image</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Product</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Brand</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Shop</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Qty</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Value Lost</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">By</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Date</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={11} className="text-center py-8 text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />{invalidDates ? 'Choose a valid date range above.' : 'Loading records…'}</td></tr>
              ) : isError ? (
                <tr><td colSpan={11} className="text-center py-8 text-accent-red">{getApiErrorMessage(error)}</td></tr>
              ) : disposals.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-12 text-center text-text-muted">No approved disposal records match these filters.</td></tr>
              ) : pagedDisposals.map((d, idx) => (
                <tr key={d.id} className="border-b border-card-border transition">
                  <td className="px-4 py-3 text-sm text-text-primary">{controlProps.startIdx + idx + 1}</td>
                  <td className="px-4 py-3"><ProductThumb src={d.image} alt={d.name} /></td>
                  <td className="px-4 py-3 text-sm text-text-primary">{d.name}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{d.brandName}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{d.branch?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-text-primary">{d.quantity}</td>
                  <td className="px-4 py-3 text-sm text-text-primary font-medium">{peso(d.value)}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary max-w-[200px] truncate">{d.reason ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="badge badge-neutral">
                      <span className={`badge-dot ${d.status === 'APPROVED' ? 'bg-accent-green' : d.status === 'DECLINED' ? 'bg-accent-red' : 'bg-accent-orange'}`} />
                      {d.status.charAt(0) + d.status.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{d.createdBy}</td>
                  <td className="px-4 py-3 text-sm"><DateTimeStack iso={d.addedAt ?? d.createdAt} /></td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile: disposal cards (hidden on desktop). */}
          <div className="md:hidden">
            {isLoading ? (
              <div className="py-8 text-center text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />{invalidDates ? 'Choose a valid date range above.' : 'Loading records…'}</div>
            ) : isError ? (
              <div className="py-8 text-center text-accent-red">{getApiErrorMessage(error)}</div>
            ) : disposals.length === 0 ? (
              <div className="py-12 text-center text-text-muted">No approved disposals yet.</div>
            ) : (
              <ul className="divide-y divide-card-border">
                {pagedDisposals.map((d, idx) => (
                  <li key={d.id} className="p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <span className="text-[11px] text-text-muted pt-2">{controlProps.startIdx + idx + 1}.</span>
                        <ProductThumb src={d.image} alt={d.name} size="w-9 h-9" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text-primary break-words">{d.quantity}× {d.name}</p>
                          <p className="text-xs text-text-muted">{d.brandName} · {d.branch?.name ?? '—'} · {peso(d.value)}</p>
                          {d.reason && <p className="text-xs text-text-secondary break-words">{d.reason}</p>}
                          <p className="text-[11px] text-text-muted">{d.createdBy} · {formatDate(d.addedAt ?? d.createdAt)}</p>
                        </div>
                      </div>
                      <span className="shrink-0 self-start badge badge-neutral">
                        <span className={`badge-dot ${d.status === 'APPROVED' ? 'bg-accent-green' : d.status === 'DECLINED' ? 'bg-accent-red' : 'bg-accent-orange'}`} />
                        {d.status.charAt(0) + d.status.slice(1).toLowerCase()}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {!isLoading && !isError && disposals.length > 0 && (
          <div className="border-t border-card-border">
            <Pagination {...controlProps} noun="disposals" />
          </div>
        )}
        <div className="border-t border-card-border p-4" hidden={isLoading || isError}>
          <p className="mb-3 text-xs text-text-muted">Totals across all matching pages · Approved disposals only · Saved cost-based losses</p>
          <div className="max-w-sm space-y-2.5 border-l-4 border-accent-orange pl-4 text-sm">
            <div className="flex items-center justify-between gap-4"><span className="font-semibold text-text-primary">Total Quantity Disposed (units)</span><span className="font-bold tabular-nums text-text-primary">{summary.totalQuantity.toLocaleString()}</span></div>
            <div className="flex items-center justify-between gap-4"><span className="text-text-secondary">Matching Disposal Records</span><span className="font-medium tabular-nums text-text-primary">{summary.count.toLocaleString()}</span></div>
            <div className="flex items-center justify-between gap-4 border-t border-card-border pt-2.5"><span className="font-bold text-text-primary">Total Value Lost</span><span className="font-bold tabular-nums text-accent-orange">{peso(summary.totalValue)}</span></div>
          </div>
        </div>
      </div>

      {showModal && <RecordDisposalModal branches={branches} onClose={() => setShowModal(false)} />}
    </div>
  );
}

function RecordDisposalModal({ branches, onClose }: { branches: { id: string; name: string }[]; onClose: () => void }) {
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const { data: productData } = useProducts({ branchId: branchId || undefined });
  const products = productData?.data ?? [];
  const createDisposal = useCreateDisposal();

  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const guardedClose = useUnsavedGuard(dirty, onClose);

  const selected = products.find((p) => p.id === productId);
  const available = selected?.quantities.find((q) => q.branchId === branchId)?.quantity ?? 0;

  async function submit() {
    if (!branchId) { setError('Select a shop.'); return; }
    if (!productId) { setError('Select a product.'); return; }
    const qty = Number(quantity);
    if (!qty || qty < 1) { setError('Enter a quantity of at least 1.'); return; }
    setError(null);
    try {
      await createDisposal.mutateAsync({ branchId, productId, quantity: qty, reason: reason.trim() || undefined });
      setDirty(false);
      onClose();
    } catch (e) { setError(getApiErrorMessage(e)); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={guardedClose} />
      <div className="glass relative rounded-lg shadow-xl w-full max-w-md mx-4 p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-text-primary">Request Disposal</h3>
          <button onClick={guardedClose} className="text-text-muted hover:text-text-primary transition"><X size={20} /></button>
        </div>
        <div className="space-y-4" onInput={() => setDirty(true)}>
          <p className="text-xs text-text-muted">Request to write off damaged/expired/unsellable stock. It goes to <strong>Pending Sales</strong> for an admin to approve. Stock is only deducted once approved.</p>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Shop <span className="text-accent-red">*</span></label>
            <Select value={branchId} onChange={(v) => { setBranchId(v); setProductId(''); setDirty(true); }} ariaLabel="Shop" placeholder="Select shop" className="w-full" options={branches.map((b) => ({ value: b.id, label: b.name }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Product <span className="text-accent-red">*</span></label>
            <Select value={productId} onChange={(v) => { setProductId(v); setDirty(true); }} ariaLabel="Product" placeholder="Select product" className="w-full" options={products.map((p) => ({ value: p.id, label: p.name }))} />
            {selected && <p className="text-xs text-text-muted mt-1">In stock at this shop: <strong>{available}</strong></p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Quantity to dispose <span className="text-accent-red">*</span></label>
            <NumberStepper min={1} max={available || undefined} ariaLabel="Quantity to dispose" value={quantity} onChange={(v) => { setQuantity(v); setDirty(true); }} className="w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Reason (optional)</label>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Expired, Damaged" className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg" />
          </div>
          {error && <p className="text-sm text-accent-red">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={guardedClose} className="btn-secondary text-text-primary px-4 py-2 rounded text-sm font-medium">Cancel</button>
            <button onClick={submit} disabled={createDisposal.isPending} className="bg-btn-danger text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-60">{createDisposal.isPending ? 'Submitting...' : 'Submit Request'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
