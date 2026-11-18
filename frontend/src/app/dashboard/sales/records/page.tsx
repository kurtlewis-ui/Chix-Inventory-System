'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Search, Loader2, Store, Clock3, CalendarDays } from 'lucide-react';
import { useSalesRecords, useBranches } from '@/lib/hooks';
import { filterSalesByProduct } from '@/lib/sale-search';
import { getApiErrorMessage } from '@/lib/api';
import { Pagination } from '@/components/Pagination';
import { Select } from '@/components/Select';
import { DateTimeStack } from '@/components/DateTimeStack';
import { ProductThumb } from '@/components/ProductThumb';
import { msUntilNextBusinessDay, phQuickRangeDates, type QuickRange } from '@/lib/business-day';
import type { PaymentMethod, PaymentSplit } from '@/lib/types';

function peso(n: number) {
  return `\u20B1${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function paymentDotColor(pm: PaymentMethod) {
  switch (pm) {
    case 'Cash': return 'bg-accent-green';
    case 'Gcash': return 'bg-accent-blue';
    case 'BankTransfer': return 'bg-accent-purple';
    default: return 'bg-text-muted';
  }
}
function methodLabel(pm: PaymentMethod): string {
  return pm === 'BankTransfer' ? 'Bank Transfer' : pm;
}
function itemPaymentLabel(item: { paymentMethod: PaymentMethod; bankNote?: string | null; paymentSplit?: PaymentSplit | null }) {
  if (item.paymentMethod === 'Split' && item.paymentSplit) {
    const parts: string[] = [];
    if (item.paymentSplit.cash > 0) parts.push(`₱${item.paymentSplit.cash.toLocaleString(undefined, { minimumFractionDigits: 2 })} Cash`);
    if (item.paymentSplit.gcash > 0) parts.push(`₱${item.paymentSplit.gcash.toLocaleString(undefined, { minimumFractionDigits: 2 })} Gcash`);
    if ((item.paymentSplit.bankTransfer ?? 0) > 0) parts.push(`₱${item.paymentSplit.bankTransfer.toLocaleString(undefined, { minimumFractionDigits: 2 })} Bank`);
    return parts.join(' · ') || 'Split';
  }
  return methodLabel(item.paymentMethod);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function SalesRecordsPage() {
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data: branchData } = useBranches();
  const branches = branchData?.data ?? [];
  // Records always opens on All Shops, independent of filters elsewhere.
  const [selectedShop, setSelectedShop] = useState('');
  const [period, setPeriod] = useState<QuickRange | 'custom'>('all');
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const limit = 10;
  const resetPage = () => setPage(1);
  useEffect(() => {
    if (search.trim() === debouncedSearch) return;
    const timer = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search, debouncedSearch]);
  useEffect(() => {
    if (period === 'custom' || period === 'all') return;
    let timer: ReturnType<typeof setTimeout>;
    const sync = () => {
      clearTimeout(timer);
      const dates = phQuickRangeDates(period);
      setStartDate(dates.start); setEndDate(dates.end); setPage(1);
      timer = setTimeout(sync, msUntilNextBusinessDay());
    };
    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
    sync();
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [period]);
  const invalidDates = period === 'custom' && (!startDate || !endDate)
    ? 'Choose both From and To dates.'
    : startDate && endDate && startDate > endDate ? 'From date must be on or before To date.' : '';
  const { data, isLoading: queryLoading, isFetching, isError, error } = useSalesRecords({
    branchId: selectedShop || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    search: debouncedSearch || undefined,
    page, limit,
  }, !invalidDates);
  const isLoading = queryLoading || !!invalidDates;
  const sales = useMemo(() => filterSalesByProduct(data?.data ?? [], debouncedSearch), [data?.data, debouncedSearch]);
  const pagedSales = sales;
  const summary = data?.summary ?? { grossSales: 0, cash: 0, gcash: 0, bankTransfer: 0, discount: 0, total: 0, count: 0 };
  const total = data?.pagination?.total ?? 0;
  const totalPages = data?.pagination?.totalPages ?? 1;
  useEffect(() => {
    if (!isFetching && !isError && data?.pagination && page > totalPages) setPage(totalPages);
  }, [data?.pagination, isFetching, isError, page, totalPages]);
  const controlProps = { page, totalPages, total, startIdx: (page - 1) * limit, shown: sales.length,
    disabled: isFetching || search.trim() !== debouncedSearch,
    onPrev: () => setPage(p => Math.max(1, p - 1)), onNext: () => setPage(p => Math.min(totalPages, p + 1)) };
  function choosePeriod(value: string) {
    const next = value as QuickRange | 'custom';
    setPeriod(next);
    const dates = next === 'custom' ? { start: '', end: '' } : phQuickRangeDates(next);
    setStartDate(dates.start); setEndDate(dates.end); resetPage();
  }

  const clearFilters = () => {
    setSelectedShop('');
    setPeriod('all');
    setDebouncedSearch('');
    setStartDate('');
    setEndDate('');
    setSearch('');
    resetPage();
  };

  return (
    <div className="min-h-screen min-w-0 bg-page-bg p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-text-primary">Sales Records</h1>
        <button onClick={clearFilters} className="px-4 py-2 border border-input-border rounded-lg text-sm text-text-primary hover:opacity-80 transition">
          Clear Filter
        </button>
      </div>

      {/* Filters */}
      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm mb-4">
        <div className="grid grid-cols-1 items-end gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="min-w-0"><span className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-text-secondary"><Store size={14} aria-hidden="true" />SHOPS</span>
            <Select value={selectedShop} onChange={v => { setSelectedShop(v); resetPage(); }} ariaLabel="Shop" options={[{ value: '', label: 'All Shops' }, ...branches.map(b => ({ value: b.id, label: b.name }))]} />
          </div>
          <div className="min-w-0"><span className="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-text-secondary"><Clock3 size={14} aria-hidden="true" />PERIOD</span>
            <Select value={period} onChange={choosePeriod} ariaLabel="Period" options={[
              { value: 'today', label: 'Daily — Today' }, { value: 'week', label: 'Weekly — This Week' },
              { value: 'month', label: 'Monthly — This Month' }, { value: 'year', label: 'Yearly — This Year' },
              { value: 'all', label: 'All Time' }, { value: 'custom', label: 'Custom Range' },
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

      {/* Table */}
      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm">
        <div className="p-4 border-b border-card-border">
          <div className="relative w-full sm:max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input aria-label="Search records" type="search" placeholder="Search products or brands..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 border border-input-border rounded-lg bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-input-focus" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="hidden w-full md:table">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Sale</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Image</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Quantity</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Brand</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Selling Price</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Sub Total</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Payment</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Staff</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Date</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={11} className="text-center py-8 text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />{invalidDates ? 'Choose a valid date range above.' : 'Loading records...'}</td></tr>
              ) : isError ? (
                <tr><td colSpan={11} className="text-center py-8 text-accent-red">{getApiErrorMessage(error)}</td></tr>
              ) : sales.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-8 text-text-muted">No sales records found.</td></tr>
              ) : pagedSales.map((sale) => (
                <Fragment key={sale.id}>
                  {sale.items.map((item, idx) => (
                    <tr key={item.id} className="border-b border-card-border transition">
                      <td className="px-4 py-3 text-sm text-text-primary font-medium">
                        {idx === 0 && (
                          <>
                            {`#${sale.number}`}
                            {sale.customerName && <p className="text-[10px] font-normal text-accent-blue mt-0.5">{sale.customerName}</p>}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3"><ProductThumb src={item.image} alt={item.name} /></td>
                      <td className="px-4 py-3 text-sm text-text-primary">{item.name}</td>
                      <td className="px-4 py-3 text-sm text-text-primary">{item.quantity}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{item.brandName}</td>
                      <td className="px-4 py-3 text-sm text-text-primary">{peso(item.unitPrice)}</td>
                      <td className="px-4 py-3 text-sm text-text-primary font-medium">
                        {peso(item.subTotal)}
                        {!!item.discount && <p className="text-xs font-normal text-accent-orange">−{peso(item.discount)} discount</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="badge badge-neutral">
                          <span className={`badge-dot ${paymentDotColor(item.paymentMethod)}`} />
                          {itemPaymentLabel(item)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {idx === 0 && (
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${sale.status === 'APPROVED' ? 'bg-accent-green/15 text-accent-green' : sale.status === 'DECLINED' ? 'bg-accent-red/15 text-accent-red' : 'bg-accent-orange/15 text-accent-orange'}`}>
                            {sale.status.charAt(0) + sale.status.slice(1).toLowerCase()}
                          </span>
                        )}
                        {idx === 0 && sale.decidedAt && (
                          <p className="text-[10px] text-text-muted mt-0.5">{formatDate(sale.decidedAt)}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{sale.staff?.name ?? '—'}</td>
                      {/* Per-item add-time on every row (falls back to the
                          sale's createdAt when absent). */}
                      <td className="px-4 py-3 text-sm"><DateTimeStack iso={item.addedAt ?? sale.createdAt} /></td>
                    </tr>
                  ))}
                  <tr className="bg-accent-orange/10 border-b border-card-border">
                    <td colSpan={11} className="px-4 py-2 text-sm font-semibold text-accent-orange">
                      Total for Sale #{sale.number}{sale.branch ? ` (${sale.branch.name})` : ''}: {peso(sale.visibleTotal)}
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>

          {/* Mobile: card list (hidden on desktop). Same data as the table,
              grouped by sale so nothing runs off the screen edge. */}
          <div className="md:hidden">
            {isLoading ? (
              <div className="py-8 text-center text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />{invalidDates ? 'Choose a valid date range above.' : 'Loading records...'}</div>
            ) : isError ? (
              <div className="py-8 text-center text-accent-red">{getApiErrorMessage(error)}</div>
            ) : sales.length === 0 ? (
              <div className="py-8 text-center text-text-muted">No sales records found.</div>
            ) : (
              <ul className="divide-y divide-card-border">
                {pagedSales.map((sale) => (
                  <li key={sale.id} className="p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text-primary">#{sale.number}</p>
                        {sale.customerName && <p className="text-[11px] text-accent-blue">{sale.customerName}</p>}
                      </div>
                      <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${sale.status === 'APPROVED' ? 'bg-accent-green/15 text-accent-green' : sale.status === 'DECLINED' ? 'bg-accent-red/15 text-accent-red' : 'bg-accent-orange/15 text-accent-orange'}`}>
                        {sale.status.charAt(0) + sale.status.slice(1).toLowerCase()}
                      </span>
                    </div>
                    <ul className="space-y-1.5">
                      {sale.items.map((item) => (
                        <li key={item.id} className="rounded-lg bg-surface-muted p-2.5 text-xs">
                          <div className="flex items-start gap-2.5">
                            <ProductThumb src={item.image} alt={item.name} size="w-9 h-9" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <span className="min-w-0 font-medium text-text-primary break-words">{item.name}</span>
                                <span className="shrink-0 font-medium text-text-primary">{peso(item.subTotal)}</span>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-text-muted">
                                <span>{item.brandName}</span>
                                <span>Qty: <span className="text-text-secondary">{item.quantity}</span></span>
                                <span>{peso(item.unitPrice)}</span>
                                <span className="inline-flex items-center gap-1"><span className={`badge-dot ${paymentDotColor(item.paymentMethod)}`} />{itemPaymentLabel(item)}</span>
                                <span>{formatDate(item.addedAt ?? sale.createdAt)}</span>
                              </div>
                              {!!item.discount && <p className="mt-0.5 text-accent-orange">−{peso(item.discount)} discount</p>}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs text-text-muted">
                      <span>{sale.staff?.name ?? '—'} · {formatDate(sale.createdAt)}</span>
                      <span className="shrink-0 font-semibold text-accent-orange">Total: {peso(sale.visibleTotal)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {!isLoading && !isError && sales.length > 0 && (
          <div className="border-t border-card-border">
            <Pagination {...controlProps} noun="sales" />
          </div>
        )}

        {/* Summary */}
        <div className="p-4 border-t border-card-border" hidden={isLoading || isError}>
          {/* Label left, amount right (tabular-nums) so every peso lines up.
              Gross − Discount = Net Sales, then Net split by payment method. */}
          <div className="border-l-4 border-accent-blue pl-4 max-w-xs space-y-2.5">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-text-secondary">Total Gross Sales</span>
              <span className="font-medium text-text-primary tabular-nums">{peso(summary.grossSales)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-text-secondary">Total Discount</span>
              <span className="text-accent-red tabular-nums">−{peso(summary.discount)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-card-border pt-2.5 text-sm">
              <span className="font-bold text-text-primary">Total Net Sales</span>
              <span className="font-bold text-text-primary tabular-nums">{peso(summary.total)}</span>
            </div>
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between gap-4 pl-3 text-sm">
                <span className="text-text-muted">Cash</span>
                <span className="text-text-secondary tabular-nums">{peso(summary.cash)}</span>
              </div>
              <div className="flex items-center justify-between gap-4 pl-3 text-sm">
                <span className="text-text-muted">Gcash</span>
                <span className="text-text-secondary tabular-nums">{peso(summary.gcash)}</span>
              </div>
              <div className="flex items-center justify-between gap-4 pl-3 text-sm">
                <span className="text-text-muted">Bank Transfer</span>
                <span className="text-text-secondary tabular-nums">{peso(summary.bankTransfer)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
