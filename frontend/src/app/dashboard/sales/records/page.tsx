'use client';

import { Fragment, useMemo, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { useSalesRecords, useBranches, useBranchSummary } from '@/lib/hooks';
import { filterSalesByProduct } from '@/lib/sale-search';
import { getApiErrorMessage } from '@/lib/api';
import { usePagination, Pagination } from '@/components/Pagination';
import { Select } from '@/components/Select';
import { useStoredBranch } from '@/lib/useStoredBranch';
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
  // Shared+persisted branch filter ('' = All Shops), remembered across the site.
  const [selectedShop, setSelectedShop] = useStoredBranch(branches);

  // Search is applied CLIENT-SIDE so it filters to the matching ITEM rows
  // (by product name or brand), not whole sales — matching the Pending Sales
  // behavior. So we don't pass `search` to the backend here.
  const { data, isLoading, isError, error } = useSalesRecords({
    branchId: selectedShop || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const sales = useMemo(() => filterSalesByProduct(data?.data ?? [], search), [data?.data, search]);
  const summary = data?.summary ?? { grossSales: 0, cash: 0, gcash: 0, bankTransfer: 0, discount: 0, total: 0, count: 0 };
  // Paginate by SALE (10 per page) — each sale renders several item rows.
  // Pagination runs on the already-filtered list so pages reflect the search.
  const { pageItems: pagedSales, resetPage, controlProps } = usePagination(sales, 10);

  // Today's approved Total Sales / Total Expenses / Net for the selected
  // shop — always about today, independent of whatever date range the
  // table above is filtered to. Only meaningful for one shop at a time, so
  // it's skipped entirely while "All Shops" is selected.
  const { data: branchSummary } = useBranchSummary(selectedShop || undefined, { enabled: !!selectedShop });

  const clearFilters = () => {
    setSelectedShop('');
    setStartDate('');
    setEndDate('');
    setSearch('');
    resetPage();
  };

  return (
    <div className="p-6 bg-page-bg min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Sales Records</h1>
        <button onClick={clearFilters} className="px-4 py-2 border border-input-border rounded-lg text-sm text-text-primary hover:opacity-80 transition">
          Clear Filter
        </button>
      </div>

      {/* Filters */}
      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm mb-4">
        <div className="p-4 flex flex-wrap items-center gap-3">
          <Select value={selectedShop} onChange={(v) => { setSelectedShop(v); resetPage(); }} ariaLabel="Shop" className="w-auto min-w-[150px]" options={[{ value: '', label: 'All Shops' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} />
          <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); resetPage(); }} className="px-3 py-2 border border-input-border rounded-lg text-sm bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus" />
          <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); resetPage(); }} className="px-3 py-2 border border-input-border rounded-lg text-sm bg-input-bg focus:outline-none focus:ring-2 focus:ring-input-focus" />
        </div>
      </div>

      {/* Today's net for the selected shop — approved sales minus approved
          expenses, automatically deducted. Independent of the date filters
          above (which apply to the table), so only shown for one shop. */}
      {branchSummary && (
        <div className="bg-card-bg rounded-xl border border-card-border shadow-sm mb-4">
          <div className="p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Today (Approved)</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
              <div>
                <p className="text-xs text-text-secondary">Total Gross Sales</p>
                <p className="text-lg font-bold tabular-nums break-words" style={{ color: '#10b981' }}>{peso(branchSummary.totalGrossSales)}</p>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Total Discount</p>
                <p className="text-lg font-bold tabular-nums break-words" style={{ color: '#f59e0b' }}>{peso(branchSummary.totalDiscount)}</p>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Total Expenses</p>
                <p className="text-lg font-bold tabular-nums break-words" style={{ color: '#ef4444' }}>{peso(branchSummary.totalExpenses)}</p>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Total Disposals</p>
                <p className="text-lg font-bold tabular-nums break-words" style={{ color: '#f97316' }}>{peso(branchSummary.totalDisposals)}</p>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Net</p>
                <p className="text-lg font-bold tabular-nums break-words" style={{ color: branchSummary.net >= 0 ? '#3b82f6' : '#ef4444' }}>{peso(branchSummary.net)}</p>
              </div>
            </div>
            {/* Payment-method breakdown of today's approved sales: Cash, Gcash,
                and Bank Transfer (Split amounts are apportioned server-side). */}
            <div className="mt-3 grid grid-cols-3 gap-3 border-t border-card-border pt-3 text-center">
              <div>
                <p className="text-xs text-text-secondary">Cash</p>
                <p className="text-base font-bold tabular-nums break-words" style={{ color: '#10b981' }}>{peso(branchSummary.cash)}</p>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Gcash</p>
                <p className="text-base font-bold tabular-nums break-words" style={{ color: '#3b82f6' }}>{peso(branchSummary.gcash)}</p>
              </div>
              <div>
                <p className="text-xs text-text-secondary">Bank Transfer</p>
                <p className="text-base font-bold tabular-nums break-words" style={{ color: '#a855f7' }}>{peso(branchSummary.bankTransfer)}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      {!selectedShop && (
        <p className="mb-4 text-xs text-text-muted">Select a shop above to see today&apos;s sales total automatically netted against expenses.</p>
      )}

      {/* Table */}
      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm">
        <div className="p-4 border-b border-card-border">
          <div className="relative w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input type="text" placeholder="Search records..." value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} className="w-full pl-9 pr-4 py-2 border border-input-border rounded-lg bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-input-focus" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="hidden w-full md:table">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Sale</th>
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
                <tr><td colSpan={10} className="text-center py-8 text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading records...</td></tr>
              ) : isError ? (
                <tr><td colSpan={10} className="text-center py-8 text-accent-red">{getApiErrorMessage(error)}</td></tr>
              ) : sales.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-text-muted">No sales records found.</td></tr>
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
                      <td className="px-4 py-3 text-sm text-text-secondary">{idx === 0 ? formatDate(sale.createdAt) : ''}</td>
                    </tr>
                  ))}
                  <tr className="bg-accent-orange/10 border-b border-card-border">
                    <td colSpan={10} className="px-4 py-2 text-sm font-semibold text-accent-orange">
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
              <div className="py-8 text-center text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading records...</div>
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
                          <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0 font-medium text-text-primary break-words">{item.name}</span>
                            <span className="shrink-0 font-medium text-text-primary">{peso(item.subTotal)}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-text-muted">
                            <span>{item.brandName}</span>
                            <span>Qty: <span className="text-text-secondary">{item.quantity}</span></span>
                            <span>{peso(item.unitPrice)}</span>
                            <span className="inline-flex items-center gap-1"><span className={`badge-dot ${paymentDotColor(item.paymentMethod)}`} />{itemPaymentLabel(item)}</span>
                          </div>
                          {!!item.discount && <p className="mt-0.5 text-accent-orange">−{peso(item.discount)} discount</p>}
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
        <div className="p-4 border-t border-card-border">
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
              {summary.bankTransfer > 0 && (
                <div className="flex items-center justify-between gap-4 pl-3 text-sm">
                  <span className="text-text-muted">Bank Transfer</span>
                  <span className="text-text-secondary tabular-nums">{peso(summary.bankTransfer)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
