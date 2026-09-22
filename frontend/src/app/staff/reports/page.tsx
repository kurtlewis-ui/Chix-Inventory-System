'use client';

import { Fragment, useMemo, useState } from 'react';
import { Search, ShoppingCart } from 'lucide-react';
import {
  useSalesRecords,
  useSalesPending,
  useDisposals,
  useExpenses,
} from '@/lib/hooks';
import { useAuthStore } from '@/lib/store';
import { getApiErrorMessage } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';
import { Select } from '@/components/Select';
import { phBusinessToday } from '@/lib/business-day';
import { filterSalesByProduct } from '@/lib/sale-search';

function peso(n: number) {
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
function itemPaymentLabel(item: { paymentMethod: string; bankNote?: string | null; paymentSplit?: { cash: number; gcash: number } | null }) {
  if (item.paymentMethod === 'Split' && item.paymentSplit) {
    const parts: string[] = [];
    if (item.paymentSplit.cash > 0) parts.push(`₱${item.paymentSplit.cash.toLocaleString(undefined, { minimumFractionDigits: 2 })} Cash`);
    if (item.paymentSplit.gcash > 0) parts.push(`₱${item.paymentSplit.gcash.toLocaleString(undefined, { minimumFractionDigits: 2 })} Gcash`);
    return parts.join(' · ') || 'Split';
  }
  return item.paymentMethod;
}
// A submitted item is visible on the report the instant it's saved.
// Declined items are excluded since they are permanently removed.

type ViewMode = 'sale' | 'product';

export default function StaffDailyReportPage() {
  const [view, setView] = useState<ViewMode>('sale');
  const [search, setSearch] = useState('');

  const branchName = useAuthStore((s) => s.user?.branch?.name);
  // Use the PH BUSINESS date (2 AM–2 AM), not the device-local calendar date,
  // so the window matches how the backend files sales. Using the device date
  // is what made the report come back empty right after saving (e.g. just
  // after midnight, or on a device in a different timezone).
  const today = useMemo(() => phBusinessToday(), []);

  // Load the full day (no server search): search is applied CLIENT-SIDE below
  // so it filters to matching ITEM rows, and so the daily summary totals stay
  // based on ALL of today's sales regardless of the search text.
  const { data, isLoading, isError, error } = useSalesRecords({
    startDate: today,
    endDate: today,
  });
  const approvedSales = data?.data ?? [];

  const { data: pendingData } = useSalesPending({
    startDate: today,
    endDate: today,
  });
  const pendingSales = pendingData?.data ?? [];

  // Today's full picture: pending + approved, sorted oldest first.
  // Tables show PENDING only; summary totals count pending + approved.
  const allSales = useMemo(
    () =>
      [...pendingSales, ...approvedSales].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [pendingSales, approvedSales],
  );

  // "View by Sale" table shows PENDING sales, with the product search applied
  // CLIENT-SIDE so it filters to the matching item rows (and recomputes each
  // sale's visible total). The daily summary below still uses allSales (full).
  const sales = useMemo(
    () => filterSalesByProduct(allSales.filter((s) => s.status === 'PENDING'), search),
    [allSales, search],
  );

  const { data: disposalsData } = useDisposals({ startDate: today, endDate: today });
  const allDisposals = (disposalsData?.data ?? []).filter((d) => d.status !== 'DECLINED');
  const todaysDisposals = allDisposals.filter((d) => d.status === 'PENDING');

  const { data: expensesData } = useExpenses({ startDate: today, endDate: today });
  const allExpenses = (expensesData?.data ?? []).filter((e) => e.status !== 'DECLINED');
  const todaysExpenses = allExpenses.filter((e) => e.status === 'PENDING');

  // Aggregate items across today's sales (pending + approved) for "View by Product".
  const productRows = useMemo(() => {
    const map = new Map<string, { name: string; brandName: string; quantity: number; total: number }>();
    for (const sale of allSales) {
      for (const item of sale.items) {
        const key = `${item.name}__${item.brandName}`;
        const cur = map.get(key) ?? { name: item.name, brandName: item.brandName, quantity: 0, total: 0 };
        cur.quantity += item.quantity;
        cur.total += item.subTotal;
        map.set(key, cur);
      }
    }
    let rows = [...map.values()];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.brandName.toLowerCase().includes(q));
    }
    return rows.sort((a, b) => b.total - a.total);
  }, [allSales, search]);

  return (
    <div>
      <div className="mb-4">
        {branchName && (
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1">{branchName}</p>
        )}
        <h1 className="text-2xl font-bold text-text-primary">Daily Report</h1>
        <p className="mt-0.5 text-xs text-text-muted">
          {/* Label the PH business day being shown (parse as local noon to
              avoid an off-by-one from timezone shifts on a bare YYYY-MM-DD). */}
          {new Date(`${today}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="mb-3 max-w-xs">
        <Select value={view} onChange={(v) => setView(v as ViewMode)} ariaLabel="View mode" className="w-full" options={[
          { value: 'sale', label: 'View by Sale' },
          { value: 'product', label: 'View by Product' },
        ]} />
      </div>

      <div className="mb-4 flex max-w-2xl items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input-border bg-input-bg py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-input-focus"
          />
        </div>
      </div>

      <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-text-primary">
        <ShoppingCart size={16} /> Today&apos;s Sales
        {sales.length > 0 && (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-text-secondary">{sales.length}</span>
        )}
      </h2>

      {isLoading ? (
        <TableSkeleton rows={5} cols={8} />
      ) : isError ? (
        <div className="py-10 text-center text-accent-red">{getApiErrorMessage(error)}</div>
      ) : sales.length === 0 ? (
        <div className="inline-block rounded-lg border border-accent-orange/40 bg-accent-orange/10 px-4 py-2 text-sm text-accent-orange">
          No sales available.
        </div>
      ) : view === 'sale' ? (
        <div className="overflow-x-auto rounded-xl border border-card-border bg-card-bg shadow-sm">
          <table className="hidden w-full md:table">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Sale</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Qty</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Brand</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Price</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Sub Total</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Payment</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Date</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <Fragment key={sale.id}>
                  {sale.items.map((item, idx) => (
                    <tr key={item.id} className="border-t border-card-border">
                      <td className="px-4 py-3 text-sm font-medium text-text-primary">
                        {idx === 0 && (
                          <>
                            {`#${sale.number}`}
                            {sale.staff?.name && (
                              <p className="text-[10px] font-normal text-text-secondary mt-0.5">{sale.staff.name}</p>
                            )}
                            {sale.customerName && (
                              <p className="text-[10px] font-normal text-accent-blue mt-0.5">{sale.customerName}</p>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-primary">
                        {item.name}
                        {item.note && <p className="text-[10px] text-text-muted italic mt-0.5">{item.note}</p>}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-primary">{item.quantity}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{item.brandName}</td>
                      <td className="px-4 py-3 text-sm text-text-primary">{peso(item.unitPrice)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-text-primary">
                        {peso(item.subTotal)}
                        {!!item.discount && <p className="text-xs font-normal text-accent-orange">−{peso(item.discount)} discount</p>}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary max-w-[200px]">
                        <span className="break-words">{itemPaymentLabel(item)}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{idx === 0 ? formatDate(sale.createdAt) : ''}</td>
                    </tr>
                  ))}
                  <tr className="bg-surface-muted border-t border-card-border">
                    <td colSpan={8} className="px-4 py-2 text-sm font-semibold text-text-primary">
                      Total for Sale #{sale.number}: {peso(sale.visibleTotal)}
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>

          {/* Mobile: sale cards (hidden on desktop). */}
          <div className="md:hidden">
            <ul className="divide-y divide-card-border">
              {sales.map((sale) => (
                <li key={sale.id} className="p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary">#{sale.number}</p>
                      {sale.staff?.name && <p className="text-[11px] text-text-secondary">{sale.staff.name}</p>}
                      {sale.customerName && <p className="text-[11px] text-accent-blue">{sale.customerName}</p>}
                    </div>
                    <span className="shrink-0 text-[11px] text-text-muted">{formatDate(sale.createdAt)}</span>
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
                          <span>{itemPaymentLabel(item)}</span>
                        </div>
                        {!!item.discount && <p className="mt-0.5 text-accent-orange">−{peso(item.discount)} discount</p>}
                        {item.note && <p className="mt-0.5 italic text-text-muted break-words">{item.note}</p>}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-right text-xs font-semibold text-text-primary">Total: {peso(sale.visibleTotal)}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-card-border bg-card-bg shadow-sm">
          <table className="hidden w-full md:table">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Product</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Brand</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Qty Sold</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Total</th>
              </tr>
            </thead>
            <tbody>
              {productRows.length === 0 ? (
                <tr><td colSpan={4} className="py-8 text-center text-text-muted">No products match your search.</td></tr>
              ) : (
                productRows.map((r) => (
                  <tr key={`${r.name}-${r.brandName}`} className="border-t border-card-border">
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">{r.name}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{r.brandName}</td>
                    <td className="px-4 py-3 text-sm text-text-primary">{r.quantity}</td>
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">{peso(r.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Mobile: product cards (hidden on desktop). */}
          <div className="md:hidden">
            {productRows.length === 0 ? (
              <div className="py-8 text-center text-text-muted">No products match your search.</div>
            ) : (
              <ul className="divide-y divide-card-border">
                {productRows.map((r) => (
                  <li key={`${r.name}-${r.brandName}`} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary break-words">{r.name}</p>
                      <p className="text-xs text-text-secondary">{r.brandName} · Qty {r.quantity}</p>
                    </div>
                    <span className="shrink-0 text-sm font-medium text-text-primary">{peso(r.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Pending Sales Summary — only for pending items */}
      {sales.length > 0 && (
        <div className="mt-4 rounded-xl border border-card-border bg-card-bg p-4 shadow-sm">
          <div className="border-l-4 border-accent-blue pl-4 text-right space-y-1">
            <p className="text-sm font-semibold text-text-primary">Total Sales: <span className="font-bold">{peso(sales.reduce((sum, s) => sum + s.total, 0))}</span></p>
            <p className="text-sm text-text-secondary">Total Cash: <span className="font-medium text-text-primary">{peso(sales.reduce((sum, s) => s.items.filter((i) => i.paymentMethod === 'Cash' || (i.paymentMethod === 'Split' && i.paymentSplit)).reduce((a, i) => a + (i.paymentMethod === 'Cash' ? i.subTotal : (i.paymentSplit as any)?.cash ?? 0), 0) + sum, 0))}</span></p>
            <p className="text-sm text-text-secondary">Total Gcash: <span className="font-medium text-text-primary">{peso(sales.reduce((sum, s) => s.items.filter((i) => i.paymentMethod === 'Gcash' || (i.paymentMethod === 'Split' && i.paymentSplit)).reduce((a, i) => a + (i.paymentMethod === 'Gcash' ? i.subTotal : (i.paymentSplit as any)?.gcash ?? 0), 0) + sum, 0))}</span></p>
            <p className="text-sm text-text-secondary">Total Discount: <span className="font-medium text-text-primary">{peso(sales.reduce((sum, s) => sum + s.items.reduce((a, i) => a + (i.discount ?? 0), 0), 0))}</span></p>
          </div>
        </div>
      )}

      {/* Today's Disposals — PENDING only */}
      <div className="mt-6 overflow-x-auto rounded-xl border border-card-border bg-card-bg shadow-sm">
        <div className="border-b border-card-border p-4">
          <h2 className="text-sm font-bold text-text-primary">Today&apos;s Disposals</h2>
        </div>
        {todaysDisposals.length === 0 ? (
          <p className="p-4 text-sm text-text-muted">No disposals today.</p>
        ) : (
          <>
          <table className="hidden w-full md:table">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Product</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Brand</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Qty</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Value</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Date</th>
              </tr>
            </thead>
            <tbody>
              {todaysDisposals.map((d) => (
                <tr key={d.id} className="border-t border-card-border">
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">
                    {d.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{d.brandName}</td>
                  <td className="px-4 py-3 text-sm text-text-primary">{d.quantity}</td>
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">{peso(d.value)}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{d.reason ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{formatDate(d.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile: disposal cards (hidden on desktop). */}
          <ul className="divide-y divide-card-border md:hidden">
            {todaysDisposals.map((d) => (
              <li key={d.id} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary break-words">{d.quantity}× {d.name}</p>
                  <p className="text-xs text-text-secondary">{d.brandName}{d.reason ? ` · ${d.reason}` : ''}</p>
                  <p className="text-[11px] text-text-muted">{formatDate(d.createdAt)}</p>
                </div>
                <span className="shrink-0 text-sm font-medium text-text-primary">{peso(d.value)}</span>
              </li>
            ))}
          </ul>
          </>
        )}
      </div>

      {/* Today's Expenses — PENDING only */}
      <div className="mt-6 overflow-x-auto rounded-xl border border-card-border bg-card-bg shadow-sm">
        <div className="border-b border-card-border p-4">
          <h2 className="text-sm font-bold text-text-primary">Today&apos;s Expenses</h2>
        </div>
        {todaysExpenses.length === 0 ? (
          <p className="p-4 text-sm text-text-muted">No expenses today.</p>
        ) : (
          <>
          <table className="hidden w-full md:table">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Note</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Date</th>
              </tr>
            </thead>
            <tbody>
              {todaysExpenses.map((e) => (
                <tr key={e.id} className="border-t border-card-border">
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">
                    {peso(e.amount)}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{e.note}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{formatDate(e.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile: expense cards (hidden on desktop). */}
          <ul className="divide-y divide-card-border md:hidden">
            {todaysExpenses.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm text-text-secondary break-words">{e.note}</p>
                  <p className="text-[11px] text-text-muted">{formatDate(e.createdAt)}</p>
                </div>
                <span className="shrink-0 text-sm font-medium text-text-primary">{peso(e.amount)}</span>
              </li>
            ))}
          </ul>
          </>
        )}
      </div>

      {/* Today's Totals — always visible. Stacks into rows on small phones so
          the peso amounts don't get cramped/clipped in three tight columns,
          and lays out as three centered columns from `sm` up. */}
      <div className="mt-6 rounded-xl border border-card-border bg-card-bg p-5 shadow-sm">
        <div className="flex flex-col divide-y divide-card-border sm:grid sm:grid-cols-4 sm:gap-4 sm:divide-y-0 sm:text-center">
          <div className="flex items-center justify-between py-2 sm:block sm:py-0">
            <p className="text-xs text-text-secondary sm:mb-1">Total Sales</p>
            <p className="text-lg font-bold text-text-primary tabular-nums break-words">{peso(allSales.reduce((sum, s) => sum + s.total, 0))}</p>
          </div>
          <div className="flex items-center justify-between py-2 sm:block sm:py-0">
            <p className="text-xs text-text-secondary sm:mb-1">Total Expenses</p>
            <p className="text-lg font-bold text-accent-red tabular-nums break-words">{peso(allExpenses.reduce((sum, e) => sum + e.amount, 0))}</p>
          </div>
          <div className="flex items-center justify-between py-2 sm:block sm:py-0">
            <p className="text-xs text-text-secondary sm:mb-1">Total Discount</p>
            <p className="text-lg font-bold text-accent-blue tabular-nums break-words">{peso(allSales.reduce((sum, s) => sum + s.items.reduce((a, i) => a + (i.discount ?? 0), 0), 0))}</p>
          </div>
          <div className="flex items-center justify-between py-2 sm:block sm:py-0">
            <p className="text-xs text-text-secondary sm:mb-1">Net</p>
            <p className="text-lg font-bold text-text-primary tabular-nums break-words">{peso(allSales.reduce((sum, s) => sum + s.total, 0) - allExpenses.reduce((sum, e) => sum + e.amount, 0))}</p>
          </div>
        </div>
      </div>

    </div>
  );
}
