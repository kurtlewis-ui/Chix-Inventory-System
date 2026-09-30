'use client';

import { Fragment, useMemo, useState } from 'react';
import { Search, ShoppingCart, Pencil, Trash2, Check } from 'lucide-react';
import {
  useSalesRecords,
  useSalesPending,
  useDisposals,
  useExpenses,
  useProducts,
  useUpdateSale,
  useDeleteSale,
  useDeleteDisposal,
  useDeleteExpense,
} from '@/lib/hooks';
import { useAuthStore } from '@/lib/store';
import { getApiErrorMessage } from '@/lib/api';
import { TableSkeleton } from '@/components/Skeleton';
import { Select } from '@/components/Select';
import { EditSaleModal } from '@/components/EditSaleModal';
import { ProductThumb } from '@/components/ProductThumb';
import { useToast } from '@/components/Toast';
import { withScrollPreserved } from '@/lib/useUnsavedGuard';
import { phBusinessToday } from '@/lib/business-day';
import { filterSalesByProduct } from '@/lib/sale-search';
import type { Sale, Disposal, Expense } from '@/lib/types';

function peso(n: number) {
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
// Split date and time so they can render on two lines (uncramped) when shown
// per item/row.
function fmtDatePart(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtTimePart(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
// A compact two-line date/time block. Used per item so each row shows its own
// original add-time without cramping the column.
function DateTimeStack({ iso, className = '' }: { iso: string; className?: string }) {
  return (
    <span className={`inline-flex flex-col leading-tight ${className}`}>
      <span className="text-text-secondary">{fmtDatePart(iso)}</span>
      <span className="text-[11px] text-text-muted">{fmtTimePart(iso)}</span>
    </span>
  );
}
function itemPaymentLabel(item: { paymentMethod: string; bankNote?: string | null; paymentSplit?: { cash: number; gcash: number; bankTransfer?: number } | null }) {
  if (item.paymentMethod === 'Split' && item.paymentSplit) {
    const parts: string[] = [];
    if (item.paymentSplit.cash > 0) parts.push(`₱${item.paymentSplit.cash.toLocaleString(undefined, { minimumFractionDigits: 2 })} Cash`);
    if (item.paymentSplit.gcash > 0) parts.push(`₱${item.paymentSplit.gcash.toLocaleString(undefined, { minimumFractionDigits: 2 })} Gcash`);
    if ((item.paymentSplit.bankTransfer ?? 0) > 0) parts.push(`₱${item.paymentSplit.bankTransfer!.toLocaleString(undefined, { minimumFractionDigits: 2 })} Bank`);
    return parts.join(' · ') || 'Split';
  }
  return item.paymentMethod === 'BankTransfer' ? 'Bank Transfer' : item.paymentMethod;
}
// A submitted item is visible on the report the instant it's saved.
// Declined items are excluded since they are permanently removed.

type ViewMode = 'sale' | 'product';

export default function StaffDailyReportPage() {
  const [view, setView] = useState<ViewMode>('sale');
  const [search, setSearch] = useState('');

  const branchName = useAuthStore((s) => s.user?.branch?.name);
  // Current staff's own id + branch — used to gate the Edit/Delete buttons to
  // the staff member's OWN pending sales, and to load their branch catalog for
  // the edit modal.
  const myUserId = useAuthStore((s) => s.user?.id);
  const myBranchId = useAuthStore((s) => s.user?.branch?.id);
  const toast = useToast();

  // Edit / delete state. `editingSale` opens the shared EditSaleModal;
  // `confirmDeleteId` arms the two-click delete confirm.
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const updateSale = useUpdateSale();
  const deleteSale = useDeleteSale();
  const deleteDisposal = useDeleteDisposal();
  const deleteExpense = useDeleteExpense();

  // Separate arm/confirm state per section so a click in one section can't
  // visually arm a row in another.
  const [confirmDeleteDisposalId, setConfirmDeleteDisposalId] = useState<string | null>(null);
  const [confirmDeleteExpenseId, setConfirmDeleteExpenseId] = useState<string | null>(null);

  // Branch product catalog for the edit modal (full active list, not the
  // default first page, so sold items resolve correctly). Scoped to the
  // staff's own branch, matching where their sales live.
  const { data: productData } = useProducts({ branchId: myBranchId || undefined, limit: 1000 });
  const products = productData?.data ?? [];

  // A pending sale is editable/deletable only by the staff who OWNS it and only
  // while still PENDING (approved sales are locked). This mirrors the backend's
  // own guards, so the buttons never appear for actions the server would reject.
  const canManageSale = (sale: Sale) => sale.status === 'PENDING' && sale.staff?.id === myUserId;

  const handleDelete = async (sale: Sale) => {
    try {
      await withScrollPreserved(() => deleteSale.mutateAsync(sale.id));
      setConfirmDeleteId(null);
    } catch (e) {
      toast.error(getApiErrorMessage(e), 'Delete failed');
    }
  };

  // A pending disposal is deletable only by the staff who created it and only
  // while PENDING (approved is locked). Deleting it restores reserved stock
  // server-side. Mirrors the backend guards.
  const canManageDisposal = (d: Disposal) => d.status === 'PENDING' && d.createdById === myUserId;
  const handleDeleteDisposal = async (d: Disposal) => {
    try {
      await withScrollPreserved(() => deleteDisposal.mutateAsync(d.id));
      setConfirmDeleteDisposalId(null);
    } catch (e) {
      toast.error(getApiErrorMessage(e), 'Delete failed');
    }
  };

  // A pending expense is deletable only by its own staff, only while PENDING.
  const canManageExpense = (e: Expense) => e.status === 'PENDING' && e.staff?.id === myUserId;
  const handleDeleteExpense = async (e: Expense) => {
    try {
      await withScrollPreserved(() => deleteExpense.mutateAsync(e.id));
      setConfirmDeleteExpenseId(null);
    } catch (err) {
      toast.error(getApiErrorMessage(err), 'Delete failed');
    }
  };

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

  // Pending disposals are shown by STATUS, not date: a disposal the staff
  // submitted stays visible every day until an Owner/Admin approves (or
  // declines) it — it does NOT disappear just because the date changed.
  // Scoped server-side to this staff's OWN submissions. Once approved it flips
  // to APPROVED and drops off this list (but is preserved in the system).
  const { data: disposalsData } = useDisposals({ status: 'PENDING' });
  const pendingDisposals = (disposalsData?.data ?? []).filter((d) => d.status === 'PENDING');

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
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Image</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Qty</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Brand</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Price</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Sub Total</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Payment</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Actions</th>
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
                      <td className="px-4 py-3"><ProductThumb src={item.image} alt={item.name} /></td>
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
                      {/* Each item shows its OWN original add-time (falls back
                          to the sale's createdAt when absent) — shown on every
                          item row, not just the first. */}
                      <td className="px-4 py-3 text-sm">
                        <DateTimeStack iso={item.addedAt ?? sale.createdAt} />
                      </td>
                      <td className="px-4 py-3">
                        {idx === 0 && canManageSale(sale) && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setEditingSale(sale)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition hover:bg-white/10 hover:text-text-primary"
                              title="Edit sale"
                              aria-label={`Edit sale #${sale.number}`}
                            >
                              <Pencil size={15} />
                            </button>
                            {confirmDeleteId === sale.id ? (
                              <>
                                <button
                                  onClick={() => handleDelete(sale)}
                                  disabled={deleteSale.isPending}
                                  className="flex h-8 items-center gap-1 rounded-lg bg-accent-red px-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                                  title="Confirm delete"
                                  aria-label={`Confirm delete sale #${sale.number}`}
                                >
                                  <Check size={14} /> Confirm
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="rounded-lg px-2 py-1 text-xs font-medium text-text-muted transition hover:bg-white/10 hover:text-text-primary"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteId(sale.id)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-accent-red transition hover:bg-accent-red/10"
                                title="Delete sale"
                                aria-label={`Delete sale #${sale.number}`}
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-surface-muted border-t border-card-border">
                    <td colSpan={10} className="px-4 py-2 text-sm font-semibold text-text-primary">
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
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="text-[11px] text-text-muted">{formatDate(sale.createdAt)}</span>
                      {canManageSale(sale) && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setEditingSale(sale)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-secondary transition hover:bg-white/10 hover:text-text-primary"
                            title="Edit sale"
                            aria-label={`Edit sale #${sale.number}`}
                          >
                            <Pencil size={14} />
                          </button>
                          {confirmDeleteId === sale.id ? (
                            <>
                              <button
                                onClick={() => handleDelete(sale)}
                                disabled={deleteSale.isPending}
                                className="flex h-7 items-center gap-1 rounded-lg bg-accent-red px-2 text-[11px] font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                                title="Confirm delete"
                              >
                                <Check size={13} /> Confirm
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="rounded-lg px-2 py-1 text-[11px] font-medium text-text-muted transition hover:bg-white/10 hover:text-text-primary"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(sale.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-accent-red transition hover:bg-accent-red/10"
                              title="Delete sale"
                              aria-label={`Delete sale #${sale.number}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
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
                              <span>{itemPaymentLabel(item)}</span>
                              <span>{formatDate(item.addedAt ?? sale.createdAt)}</span>
                            </div>
                            {!!item.discount && <p className="mt-0.5 text-accent-orange">−{peso(item.discount)} discount</p>}
                            {item.note && <p className="mt-0.5 italic text-text-muted break-words">{item.note}</p>}
                          </div>
                        </div>
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

      {/* Daily Report Summary — redesigned to be easy to scan: a prominent
          Total Sales headline, then each payment method as an aligned
          label → value row (with a small color dot), instead of the old
          cramped right-aligned text block. */}
      {sales.length > 0 && (() => {
        // Per-method totals. A Split item contributes each of its split
        // buckets; a non-split item contributes its whole subTotal to its own
        // method. Computed once here for clarity (was inline reducers).
        const methodTotal = (method: 'Cash' | 'Gcash' | 'BankTransfer') =>
          sales.reduce(
            (sum, s) =>
              sum +
              s.items.reduce(
                (a, i) =>
                  a +
                  (i.paymentMethod === method
                    ? i.subTotal
                    : i.paymentMethod === 'Split' && i.paymentSplit
                      ? Number(
                          (i.paymentSplit as any)?.[
                            method === 'BankTransfer' ? 'bankTransfer' : method.toLowerCase()
                          ] ?? 0,
                        )
                      : 0),
                0,
              ),
            0,
          );
        const totalSales = sales.reduce((sum, s) => sum + s.total, 0);
        const totalDiscount = sales.reduce((sum, s) => sum + s.items.reduce((a, i) => a + (i.discount ?? 0), 0), 0);
        const rows: { label: string; value: number; dot: string }[] = [
          { label: 'Cash', value: methodTotal('Cash'), dot: '#10b981' },
          { label: 'Gcash', value: methodTotal('Gcash'), dot: '#3b82f6' },
          { label: 'Bank Transfer', value: methodTotal('BankTransfer'), dot: '#a855f7' },
        ];
        return (
          <div className="mt-4 rounded-xl border border-card-border bg-card-bg p-4 shadow-sm">
            {/* Headline: Total Sales — kept green, a touch larger than the rows. */}
            <div className="flex items-baseline justify-between gap-3 border-b border-card-border pb-2.5">
              <span className="text-sm font-semibold text-text-primary">Total Sales</span>
              <span className="text-sm font-bold leading-none tabular-nums" style={{ color: '#10b981' }}>{peso(totalSales)}</span>
            </div>

            {/* Payment methods — color dot kept for quick ID; label + amount use
                the theme text color (black in light, white in dark). Compact. */}
            <div className="mt-2.5 space-y-1.5">
              {rows.map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-xs text-text-primary">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.dot }} />
                    {r.label}
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-text-primary">{peso(r.value)}</span>
                </div>
              ))}
            </div>

            {/* Discount, set apart at the bottom — shown in red. */}
            <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-card-border pt-2.5">
              <span className="text-xs text-text-primary">Total Discount</span>
              <span className="text-xs font-semibold tabular-nums" style={{ color: '#ef4444' }}>{peso(totalDiscount)}</span>
            </div>
          </div>
        );
      })()}

      {/* Pending Disposals — the staff's OWN disposals awaiting approval,
          shown by status regardless of the date they were submitted. */}
      <div className="mt-6 overflow-x-auto rounded-xl border border-card-border bg-card-bg shadow-sm">
        <div className="border-b border-card-border p-4">
          <h2 className="text-sm font-bold text-text-primary">Pending Disposals</h2>
        </div>
        {pendingDisposals.length === 0 ? (
          <p className="p-4 text-sm text-text-muted">No pending disposals.</p>
        ) : (
          <>
          <table className="hidden w-full md:table">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Image</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Product</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Brand</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Qty</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Value</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingDisposals.map((d) => (
                <tr key={d.id} className="border-t border-card-border">
                  <td className="px-4 py-3"><ProductThumb src={d.image} alt={d.name} /></td>
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">
                    {d.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{d.brandName}</td>
                  <td className="px-4 py-3 text-sm text-text-primary">{d.quantity}</td>
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">{peso(d.value)}</td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{d.reason ?? '—'}</td>
                  <td className="px-4 py-3 text-sm"><DateTimeStack iso={d.addedAt ?? d.createdAt} /></td>
                  <td className="px-4 py-3">
                    {canManageDisposal(d) && (
                      confirmDeleteDisposalId === d.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDeleteDisposal(d)}
                            disabled={deleteDisposal.isPending}
                            className="flex h-8 items-center gap-1 rounded-lg bg-accent-red px-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                            title="Confirm delete"
                          >
                            <Check size={14} /> Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDeleteDisposalId(null)}
                            className="rounded-lg px-2 py-1 text-xs font-medium text-text-muted transition hover:bg-white/10 hover:text-text-primary"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteDisposalId(d.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-accent-red transition hover:bg-accent-red/10"
                          title="Delete disposal"
                          aria-label="Delete disposal"
                        >
                          <Trash2 size={15} />
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile: disposal cards (hidden on desktop). */}
          <ul className="divide-y divide-card-border md:hidden">
            {pendingDisposals.map((d) => (
              <li key={d.id} className="flex items-start justify-between gap-3 p-4">
                <div className="flex min-w-0 items-start gap-2.5">
                  <ProductThumb src={d.image} alt={d.name} size="w-9 h-9" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary break-words">{d.quantity}× {d.name}</p>
                    <p className="text-xs text-text-secondary">{d.brandName}{d.reason ? ` · ${d.reason}` : ''}</p>
                    <p className="text-[11px] text-text-muted">{formatDate(d.addedAt ?? d.createdAt)}</p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="text-sm font-medium text-text-primary">{peso(d.value)}</span>
                  {canManageDisposal(d) && (
                    confirmDeleteDisposalId === d.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDeleteDisposal(d)}
                          disabled={deleteDisposal.isPending}
                          className="flex h-7 items-center gap-1 rounded-lg bg-accent-red px-2 text-[11px] font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                          title="Confirm delete"
                        >
                          <Check size={13} /> Confirm
                        </button>
                        <button
                          onClick={() => setConfirmDeleteDisposalId(null)}
                          className="rounded-lg px-2 py-1 text-[11px] font-medium text-text-muted transition hover:bg-white/10 hover:text-text-primary"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteDisposalId(d.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-accent-red transition hover:bg-accent-red/10"
                        title="Delete disposal"
                        aria-label="Delete disposal"
                      >
                        <Trash2 size={14} />
                      </button>
                    )
                  )}
                </div>
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
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {todaysExpenses.map((e) => (
                <tr key={e.id} className="border-t border-card-border">
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">
                    {peso(e.amount)}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{e.note}</td>
                  <td className="px-4 py-3 text-sm"><DateTimeStack iso={e.addedAt ?? e.createdAt} /></td>
                  <td className="px-4 py-3">
                    {canManageExpense(e) && (
                      confirmDeleteExpenseId === e.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDeleteExpense(e)}
                            disabled={deleteExpense.isPending}
                            className="flex h-8 items-center gap-1 rounded-lg bg-accent-red px-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                            title="Confirm delete"
                          >
                            <Check size={14} /> Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDeleteExpenseId(null)}
                            className="rounded-lg px-2 py-1 text-xs font-medium text-text-muted transition hover:bg-white/10 hover:text-text-primary"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteExpenseId(e.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-accent-red transition hover:bg-accent-red/10"
                          title="Delete expense"
                          aria-label="Delete expense"
                        >
                          <Trash2 size={15} />
                        </button>
                      )
                    )}
                  </td>
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
                  <p className="text-[11px] text-text-muted">{formatDate(e.addedAt ?? e.createdAt)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="text-sm font-medium text-text-primary">{peso(e.amount)}</span>
                  {canManageExpense(e) && (
                    confirmDeleteExpenseId === e.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDeleteExpense(e)}
                          disabled={deleteExpense.isPending}
                          className="flex h-7 items-center gap-1 rounded-lg bg-accent-red px-2 text-[11px] font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                          title="Confirm delete"
                        >
                          <Check size={13} /> Confirm
                        </button>
                        <button
                          onClick={() => setConfirmDeleteExpenseId(null)}
                          className="rounded-lg px-2 py-1 text-[11px] font-medium text-text-muted transition hover:bg-white/10 hover:text-text-primary"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteExpenseId(e.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-accent-red transition hover:bg-accent-red/10"
                        title="Delete expense"
                        aria-label="Delete expense"
                      >
                        <Trash2 size={14} />
                      </button>
                    )
                  )}
                </div>
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
            <p className="text-lg font-bold tabular-nums break-words" style={{ color: '#10b981' }}>{peso(allSales.reduce((sum, s) => sum + s.total, 0))}</p>
          </div>
          <div className="flex items-center justify-between py-2 sm:block sm:py-0">
            <p className="text-xs text-text-secondary sm:mb-1">Total Expenses</p>
            <p className="text-lg font-bold tabular-nums break-words" style={{ color: '#ef4444' }}>{peso(allExpenses.reduce((sum, e) => sum + e.amount, 0))}</p>
          </div>
          <div className="flex items-center justify-between py-2 sm:block sm:py-0">
            <p className="text-xs text-text-secondary sm:mb-1">Total Discount</p>
            <p className="text-lg font-bold tabular-nums break-words" style={{ color: '#f59e0b' }}>{peso(allSales.reduce((sum, s) => sum + s.items.reduce((a, i) => a + (i.discount ?? 0), 0), 0))}</p>
          </div>
          <div className="flex items-center justify-between py-2 sm:block sm:py-0">
            <p className="text-xs text-text-secondary sm:mb-1">Net</p>
            <p className="text-lg font-bold tabular-nums break-words" style={{ color: (allSales.reduce((sum, s) => sum + s.total, 0) - allExpenses.reduce((sum, e) => sum + e.amount, 0)) >= 0 ? '#3b82f6' : '#ef4444' }}>{peso(allSales.reduce((sum, s) => sum + s.total, 0) - allExpenses.reduce((sum, e) => sum + e.amount, 0))}</p>
          </div>
        </div>
      </div>

      {/* Edit modal for a pending sale (shared with the Pending page). On save
          it PATCHes the sale, which restores the old stock and reserves the new
          quantities server-side, then refreshes the report. */}
      {editingSale && (
        <EditSaleModal
          sale={editingSale}
          products={products}
          isSaving={updateSale.isPending}
          onClose={() => setEditingSale(null)}
          onSave={async (payload) => {
            try {
              await withScrollPreserved(() => updateSale.mutateAsync({ id: editingSale.id, ...payload }));
              setEditingSale(null);
            } catch (e) {
              throw new Error(getApiErrorMessage(e));
            }
          }}
        />
      )}

    </div>
  );
}
