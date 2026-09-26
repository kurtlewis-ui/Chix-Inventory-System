'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Search, Pencil, Trash2, X, CheckCircle, XCircle, Loader2, Recycle, ShoppingBag, PhilippinePeso, Send, Check } from 'lucide-react';
import {
  useSalesPending,
  useBranches,
  useProducts,
  useApproveSale,
  useDeclineSale,
  useUpdateSale,
  useDisposalsPending,
  useApproveDisposal,
  useDeclineDisposal,
  useStaffDrafts,
  useSaveDraftForStaff,
  useClearStaffDraft,
  useClearAllDrafts,
  useExpensesPending,
  useApproveExpense,
  useDeclineExpense,
  useBranchSummary,
  type SaleItemInput,
} from '@/lib/hooks';
import { getApiErrorMessage } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { Select } from '@/components/Select';
import { NumberStepper } from '@/components/NumberStepper';
import { useUnsavedGuard, withScrollPreserved } from '@/lib/useUnsavedGuard';
import { useStoredBranch } from '@/lib/useStoredBranch';
import { filterSalesByProduct } from '@/lib/sale-search';
import { useAuthStore } from '@/lib/store';
import type { Sale, PaymentMethod, PaymentSplit } from '@/lib/types';

function peso(n: number) {
  return `\u20B1${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
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

// Local modal for this page. `size` controls the max width — default keeps the
// previous max-w-lg so the Delete-sale dialog is unchanged; 'xl' widens the
// Edit Sale modal (which has multi-column item rows). Full-width on mobile,
// widening only from the sm breakpoint up so phones stay comfortable.
function Modal({
  title,
  onClose,
  children,
  size = 'md',
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'md' | 'xl';
}) {
  const widthClass = size === 'xl' ? 'sm:max-w-3xl' : 'sm:max-w-lg';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`glass relative rounded-lg shadow-xl w-full ${widthClass} p-4 sm:p-6 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-text-primary">{title}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Compact icon-only action button used in the Staff Drafts rows/cards. It
 * carries its own two-click confirm: first click "arms" it (the icon swaps to
 * a check and the tint turns solid), second click runs the action. Keeps the
 * actions column tight and professional instead of wide text buttons.
 */
/**
 * Standardized header bulk-action button used across ALL Pending-page sections
 * (Sales, Staff Drafts, Disposals, Expenses) so every "Approve/Accept All" and
 * "Decline/Clear All" looks and behaves identically:
 *   - positive → solid green (approve / accept)
 *   - negative → solid red   (decline / clear)
 * Two-click confirm: the first click "arms" the button (shows "Confirm?"), the
 * second runs the action. When armed, a small inline Cancel appears next to it.
 * `armed` is derived from the caller's shared confirmAction state, so only one
 * button can be armed at a time.
 */
function BulkActionButton({
  tone,
  label,
  icon,
  armed,
  disabled,
  onClick,
  onCancel,
  title,
}: {
  tone: 'positive' | 'negative';
  label: string;
  icon: React.ReactNode;
  armed: boolean;
  disabled?: boolean;
  onClick: () => void;
  onCancel: () => void;
  title: string;
}) {
  const base =
    'inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed';
  const cls = tone === 'positive' ? 'bg-accent-green' : 'bg-accent-red';
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={armed ? `Confirm: ${title}` : title}
        aria-label={title}
        className={`${base} ${cls}`}
      >
        {armed ? <Check size={16} /> : icon}
        <span>{armed ? 'Confirm?' : label}</span>
      </button>
      {armed && (
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-2 text-xs font-medium text-text-muted transition hover:bg-white/10 hover:text-text-primary"
        >
          Cancel
        </button>
      )}
    </>
  );
}

function DraftIconButton({
  icon,
  label,
  armed,
  onClick,
  disabled,
  tone,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  armed: boolean;
  onClick: () => void;
  disabled?: boolean;
  tone: 'positive' | 'negative';
  title: string;
}) {
  // Same green/red language as the header BulkActionButton so every action on
  // this page matches: positive → solid green, negative → solid red.
  const cls = tone === 'positive' ? 'bg-accent-green text-white' : 'bg-accent-red text-white';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={armed ? `Confirm: ${title}` : title}
      aria-label={title}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}
    >
      {armed ? <Check size={16} /> : icon}
      <span>{armed ? 'Confirm?' : label}</span>
    </button>
  );
}

interface EditRow {
  // Empty string only for a brand-new row before a product is picked.
  productId: string;
  quantity: number;
  discount?: number;
  paymentMethod: PaymentMethod;
  bankNote?: string | null;
  note?: string | null;
  paymentSplit?: PaymentSplit | null;
  // Snapshots carried from the original sale line so the row renders and
  // prices correctly even when the product is no longer in the live catalog
  // (deleted/archived). unitPrice is what was ACTUALLY charged on this sale.
  snapshotName?: string;
  snapshotBrandName?: string;
  snapshotUnitPrice?: number;
  // True when this line's product no longer exists in the active catalog.
  // Such a line can be viewed/removed but not re-pointed to itself, and the
  // backend would reject re-submitting it, so we block saving until it's
  // removed or (not possible here) replaced.
  missingProduct?: boolean;
}

export default function SalesPendingPage() {
  const [search, setSearch] = useState('');

  const { data: branchData } = useBranches();
  const branches = branchData?.data ?? [];

  // No "All Shops" here — always scoped to one branch. Shared+persisted across
  // the site, so the branch you were working on is remembered on refresh; the
  // hook auto-selects the first branch when none/invalid is stored.
  const [selectedShop, setSelectedShop] = useStoredBranch(branches, { allowAll: false });

  // Load the FULL active catalog for the currently-selected branch (not the
  // default 20-row first page, which made the Edit Sale modal wrongly flag
  // most sold items as "no longer exists"). Scoped to the branch so the prices
  // shown match what that branch charges. All pending sales here belong to this
  // branch, so this is the right catalog for editing them.
  const { data: productData } = useProducts({ branchId: selectedShop || undefined, limit: 1000 });
  const products = productData?.data ?? [];

  // Note: search is applied CLIENT-SIDE (see filterSalesByProduct) so it filters
  // to the matching ITEM rows, not whole sales. We intentionally do NOT pass
  // `search` to the backend here — the server search returns whole sales, which
  // is the behavior we're replacing.
  const { data, isLoading, isError, error } = useSalesPending({
    branchId: selectedShop || undefined,
  });
  const sales = useMemo(() => filterSalesByProduct(data?.data ?? [], search), [data?.data, search]);
  const summary = data?.summary ?? { grossSales: 0, cash: 0, gcash: 0, bankTransfer: 0, discount: 0, total: 0, count: 0 };

  // Admin may approve/decline pending sales but must NOT edit them (the backend
  // rejects Admin edits too). Only the Owner sees the Edit control here.
  const canEditSale = useAuthStore((s) => s.user?.role?.name === 'Owner');

  const approveSale = useApproveSale();
  const declineSale = useDeclineSale();
  const updateSale = useUpdateSale();

  // Pending disposals (admin approves/declines these too) — live.
  const { data: disposalData, isLoading: dispLoading } = useDisposalsPending({
    search,
    branchId: selectedShop || undefined,
  });
  const disposals = disposalData?.data ?? [];
  const approveDisposal = useApproveDisposal();
  const declineDisposal = useDeclineDisposal();

  // Pending expenses — live.
  const { data: expenseData, isLoading: expLoading } = useExpensesPending({
    search,
    branchId: selectedShop || undefined,
  });
  const expenses = expenseData?.data ?? [];
  const approveExpense = useApproveExpense();
  const declineExpense = useDeclineExpense();

  // Staff draft carts (not yet submitted) — live view for admins.
  const { data: draftsData, isLoading: draftsLoading } = useStaffDrafts(selectedShop || undefined);
  const drafts = draftsData ?? [];
  const saveDraftForStaff = useSaveDraftForStaff();
  const clearStaffDraft = useClearStaffDraft();
  const clearAllDrafts = useClearAllDrafts();

  // Today's approved Total Sales / Total Expenses / Net for the selected branch.
  const { data: branchSummary } = useBranchSummary(selectedShop || undefined);

  const toast = useToast();
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  // Auto-dismiss success messages after 5 seconds.
  useEffect(() => {
    if (!actionStatus) return;
    const timer = setTimeout(() => setActionStatus(null), 5000);
    return () => clearTimeout(timer);
  }, [actionStatus]);

  async function runSafe(fn: () => Promise<unknown>) {
    setActionError(null);
    setActionStatus(null);
    // Success toasts come from the individual mutation hooks (approve/decline/
    // delete/update already toast), so here we only surface FAILURES as a
    // float — in addition to the inline error — so nothing fails silently.
    try { await fn(); } catch (e) {
      const msg = getApiErrorMessage(e);
      setActionError(msg);
      toast.error(msg, 'Action failed');
    }
  }

  const handleApproveAll = () => {
    const n = sales.length;
    if (n === 0) return;
    if (confirmAction !== 'approve-all-sales') { setConfirmAction('approve-all-sales'); return; }
    setConfirmAction(null);
    runSafe(async () => {
      await Promise.all(sales.map((s) => approveSale.mutateAsync(s.id)));
      setActionStatus(`✓ All ${n} pending sale${n === 1 ? '' : 's'} have been approved.`);
    });
  };
  const handleDeclineAll = () => {
    const n = sales.length;
    if (n === 0) return;
    if (confirmAction !== 'decline-all-sales') { setConfirmAction('decline-all-sales'); return; }
    setConfirmAction(null);
    runSafe(async () => {
      await Promise.all(sales.map((s) => declineSale.mutateAsync(s.id)));
      setActionStatus(`✓ All ${n} pending sale${n === 1 ? '' : 's'} have been declined.`);
    });
  };

  const busy = approveSale.isPending || declineSale.isPending;

  // Owner-only bulk action: submit EVERY staff draft on their behalf, so all
  // in-progress carts become pending sales in one click. Runs the same
  // per-staff save the individual "Save Draft" buttons use, sequentially so a
  // single failure surfaces without aborting the rest, then reports a summary.
  const handleAcceptAllDrafts = () => {
    const n = drafts.length;
    if (n === 0) return;
    if (confirmAction !== 'accept-all-drafts') { setConfirmAction('accept-all-drafts'); return; }
    setConfirmAction(null);
    runSafe(async () => {
      const failures: string[] = [];
      let saved = 0;
      for (const d of drafts) {
        try {
          const result = await saveDraftForStaff.mutateAsync(d.staff.id);
          if (result.errors.length > 0) failures.push(`${d.staff.name}: ${result.errors.join('; ')}`);
          else saved += 1;
        } catch (e) {
          failures.push(`${d.staff.name}: ${getApiErrorMessage(e)}`);
        }
      }
      setActionStatus(
        failures.length > 0
          ? `Saved ${saved} of ${n} draft${n === 1 ? '' : 's'} — issues: ${failures.join(' | ')}`
          : `✓ All ${n} staff draft${n === 1 ? '' : 's'} submitted for approval.`,
      );
    });
  };

  // Discard a single staff member's draft WITHOUT submitting it (two-click
  // confirm). Nothing is sold/disposed/expensed — the cart is thrown away.
  const handleClearDraft = (staffId: string, staffName: string) => {
    if (confirmAction !== `clear-draft-${staffId}`) { setConfirmAction(`clear-draft-${staffId}`); return; }
    setConfirmAction(null);
    runSafe(async () => {
      await clearStaffDraft.mutateAsync(staffId);
      setActionStatus(`Cleared ${staffName}'s draft (nothing was submitted).`);
    });
  };

  // Discard EVERY staff draft for the current branch without submitting any
  // of them (two-click confirm — destructive, so styled red).
  const handleClearAllDrafts = () => {
    const n = drafts.length;
    if (n === 0) return;
    if (confirmAction !== 'clear-all-drafts') { setConfirmAction('clear-all-drafts'); return; }
    setConfirmAction(null);
    runSafe(async () => {
      const res = await clearAllDrafts.mutateAsync(selectedShop || undefined);
      setActionStatus(`Cleared ${res.cleared} draft${res.cleared === 1 ? '' : 's'} (nothing was submitted).`);
    });
  };

  const draftBusy = saveDraftForStaff.isPending || clearStaffDraft.isPending || clearAllDrafts.isPending;

  return (
    <div className="p-6 bg-page-bg min-h-screen">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-text-primary">Pending Sales</h1>
        <div className="flex flex-wrap items-center gap-2">
          <BulkActionButton
            tone="positive"
            label="Approve All"
            icon={<CheckCircle size={16} />}
            armed={confirmAction === 'approve-all-sales'}
            disabled={busy || sales.length === 0}
            onClick={handleApproveAll}
            onCancel={() => setConfirmAction(null)}
            title="Approve all pending sales"
          />
          <BulkActionButton
            tone="negative"
            label="Decline All"
            icon={<XCircle size={16} />}
            armed={confirmAction === 'decline-all-sales'}
            disabled={busy || sales.length === 0}
            onClick={handleDeclineAll}
            onCancel={() => setConfirmAction(null)}
            title="Decline all pending sales"
          />
        </div>
      </div>

      {actionError && (
        <div className="mb-4 rounded-lg bg-accent-red/10 border border-accent-red/30 px-4 py-2 text-sm text-accent-red">{actionError}</div>
      )}
      {actionStatus && (
        <div className="mb-4 rounded-lg bg-accent-green/10 border border-accent-green/30 px-4 py-2 text-sm text-accent-green font-medium">{actionStatus}</div>
      )}

      {/* Filters */}
      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm mb-4">
        <div className="p-4 flex flex-wrap items-center gap-3">
          <Select value={selectedShop} onChange={setSelectedShop} ariaLabel="Shop" placeholder="No shops yet" className="w-auto min-w-[150px]" options={branches.map((b) => ({ value: b.id, label: b.name }))} />
        </div>
      </div>

      {/* Today's net for this branch — approved sales minus approved expenses,
          so an admin sees the real impact before approving anything pending. */}
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
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm">
        <div className="p-4 border-b border-card-border">
          <div className="relative w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input type="text" placeholder="Search pending sales..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 border border-input-border rounded-lg bg-input-bg text-sm focus:outline-none focus:ring-2 focus:ring-input-focus" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="hidden w-full md:table">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase">Sale</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase">Name</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase">Qty</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase">Brand</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase">Price</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase">Sub Total</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase">Payment</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase">Staff</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase">Date</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={10} className="text-center py-8 text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading pending sales...</td></tr>
              ) : isError ? (
                <tr><td colSpan={10} className="text-center py-8 text-accent-red">{getApiErrorMessage(error)}</td></tr>
              ) : sales.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-text-muted">No pending sales.</td></tr>
              ) : sales.map((sale) => (
                <Fragment key={sale.id}>
                  {sale.items.map((item, idx) => (
                    <tr key={item.id} className="border-b border-card-border/60 transition">
                      <td className="px-4 py-4 text-sm text-text-primary font-medium">
                        {idx === 0 && (
                          <>
                            {`#${sale.number}`}
                            {sale.customerName && <p className="text-[10px] font-normal text-accent-blue mt-0.5">{sale.customerName}</p>}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-text-primary">{item.name}</td>
                      <td className="px-4 py-4 text-sm text-text-primary">{item.quantity}</td>
                      <td className="px-4 py-4 text-sm text-text-secondary">{item.brandName}</td>
                      <td className="px-4 py-4 text-sm text-text-primary">{peso(item.unitPrice)}</td>
                      <td className="px-4 py-4 text-sm text-text-primary font-medium">
                        {peso(item.subTotal)}
                        {!!item.discount && <p className="text-xs font-normal text-accent-orange">−{peso(item.discount)} discount</p>}
                      </td>
                      <td className="px-4 py-4">
                        <span className="badge badge-neutral">
                          <span className={`badge-dot ${paymentDotColor(item.paymentMethod)}`} />
                          {itemPaymentLabel(item)}
                        </span>
                        {item.note && <p className="mt-0.5 text-[11px] text-text-muted truncate max-w-[140px]">{item.note}</p>}
                      </td>
                      <td className="px-4 py-4 text-sm text-text-secondary">{sale.staff?.name ?? '—'}</td>
                      <td className="px-4 py-4 text-sm text-text-secondary">{idx === 0 ? formatDate(sale.createdAt) : ''}</td>
                      <td className="px-4 py-4">
                        {idx === 0 && (
                          <div className="act-group">
                            <button onClick={() => runSafe(async () => { await approveSale.mutateAsync(sale.id); setActionStatus(`✓ Sale #${sale.number} approved.`); })} className="act-btn act-approve" title="Approve"><CheckCircle size={16} /></button>
                            <button onClick={() => runSafe(async () => { await declineSale.mutateAsync(sale.id); setActionStatus(`Sale #${sale.number} declined.`); })} className="act-btn act-decline" title="Decline"><XCircle size={16} /></button>
                            {canEditSale && <button onClick={() => { setActionError(null); setEditingSale(sale); }} className="act-btn act-edit" title="Edit"><Pencil size={16} /></button>}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-accent-orange/10 border-b border-card-border">
                    <td colSpan={10} className="px-4 py-2 text-sm font-semibold text-accent-orange">
                      Total for Sale #{sale.number}: {peso(sale.visibleTotal)}
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>

          {/* Mobile: pending-sale cards (hidden on desktop). */}
          <div className="md:hidden">
            {isLoading ? (
              <div className="py-8 text-center text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading pending sales...</div>
            ) : isError ? (
              <div className="py-8 text-center text-accent-red">{getApiErrorMessage(error)}</div>
            ) : sales.length === 0 ? (
              <div className="py-8 text-center text-text-muted">No pending sales.</div>
            ) : (
              <ul className="divide-y divide-card-border">
                {sales.map((sale) => (
                  <li key={sale.id} className="p-4">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text-primary">#{sale.number}</p>
                        {sale.customerName && <p className="text-[11px] text-accent-blue">{sale.customerName}</p>}
                        <p className="text-[11px] text-text-muted">{sale.staff?.name ?? '—'} · {formatDate(sale.createdAt)}</p>
                      </div>
                      <div className="act-group shrink-0">
                        <button onClick={() => runSafe(async () => { await approveSale.mutateAsync(sale.id); setActionStatus(`✓ Sale #${sale.number} approved.`); })} className="act-btn act-approve" title="Approve"><CheckCircle size={16} /></button>
                        <button onClick={() => runSafe(async () => { await declineSale.mutateAsync(sale.id); setActionStatus(`Sale #${sale.number} declined.`); })} className="act-btn act-decline" title="Decline"><XCircle size={16} /></button>
                        {canEditSale && <button onClick={() => { setActionError(null); setEditingSale(sale); }} className="act-btn act-edit" title="Edit"><Pencil size={16} /></button>}
                      </div>
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
                          {item.note && <p className="mt-0.5 text-text-muted break-words">{item.note}</p>}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-right text-xs font-semibold text-accent-orange">Total: {peso(sale.visibleTotal)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="p-4 border-t border-card-border">
          {/* Label left, amount right (tabular-nums) so every peso lines up in
              one column. Reads top-down: Gross − Discount = Net Sales, then Net
              split by payment method (indented). Discount is subtracted once. */}
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

      {/* Staff Drafts (in-progress carts, not yet submitted) */}
      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm mt-8">
        <div className="flex flex-col gap-3 p-5 border-b border-card-border sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-bold text-text-primary">
              <ShoppingBag size={18} /> Staff Drafts
              {drafts.length > 0 && <span className="badge badge-neutral">{drafts.length}</span>}
            </h2>
            <p className="mt-1 text-xs text-text-muted">In-progress staff carts — not yet submitted for approval.</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <BulkActionButton
              tone="positive"
              label="Accept All"
              icon={<Send size={15} />}
              armed={confirmAction === 'accept-all-drafts'}
              disabled={draftBusy || drafts.length === 0}
              onClick={handleAcceptAllDrafts}
              onCancel={() => setConfirmAction(null)}
              title="Submit every staff member's draft on their behalf"
            />
            <BulkActionButton
              tone="negative"
              label="Clear All"
              icon={<Trash2 size={15} />}
              armed={confirmAction === 'clear-all-drafts'}
              disabled={draftBusy || drafts.length === 0}
              onClick={handleClearAllDrafts}
              onCancel={() => setConfirmAction(null)}
              title="Discard every staff draft without submitting (nothing is sold)"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="hidden w-full table-fixed md:table">
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[31%]" />
              <col className="w-[11%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[9%]" />
              <col className="w-[13%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-card-border bg-table-header text-table-header-text">
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wide">Staff</th>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wide">To Sell</th>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wide">To Dispose</th>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wide">Expenses</th>
                <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wide">Total</th>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wide">Updated</th>
                <th className="px-5 py-3.5 text-center text-[11px] font-semibold uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {draftsLoading ? (
                <tr><td colSpan={7} className="text-center py-10 text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading…</td></tr>
              ) : drafts.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-text-muted">No staff currently building an order.</td></tr>
              ) : drafts.map((d) => (
                <tr key={d.id} className="border-b border-card-border/60 align-top transition hover:bg-white/[0.02]">
                  <td className="px-5 py-5 align-top">
                    <p className="text-sm font-semibold leading-snug text-text-primary">{d.staff.name}</p>
                  </td>
                  <td className="px-5 py-5 align-top">
                    {d.items.length === 0 ? <span className="text-text-muted">—</span> : (
                      <ul className="divide-y divide-card-border/40">
                        {d.items.map((item: any) => (
                          <li key={item.productId} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-white/10 px-1.5 text-[11px] font-semibold tabular-nums text-text-secondary">{item.quantity}×</span>
                              <span className="min-w-0 truncate text-sm font-medium text-text-primary" title={item.name}>{item.name}</span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <span className="badge badge-neutral whitespace-nowrap">
                                <span className={`badge-dot ${paymentDotColor(item.paymentMethod)}`} />
                                {itemPaymentLabel(item)}
                              </span>
                              {item.addedAt && <span className="w-14 text-right text-[10px] tabular-nums text-text-muted">{new Date(item.addedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-5 py-5 align-top">
                    {d.disposalItems.length === 0 ? <span className="text-text-muted">—</span> : (
                      <ul className="space-y-2">
                        {d.disposalItems.map((item) => (
                          <li key={item.productId} className="flex items-center gap-2">
                            <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-white/10 px-1.5 text-[11px] font-semibold tabular-nums text-text-secondary">{item.quantity}×</span>
                            <span className="min-w-0 truncate text-sm text-text-secondary" title={item.name}>{item.name}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-5 py-5 align-top">
                    {d.expenses.length === 0 ? <span className="text-text-muted">—</span> : (
                      <ul className="space-y-2 text-sm">
                        {d.expenses.map((exp, idx) => (
                          <li key={idx} className="min-w-0">
                            <span className="font-medium tabular-nums text-accent-red">−{peso(exp.amount)}</span>
                            {exp.note && <span className="block truncate text-xs text-text-muted" title={exp.note}>{exp.note}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-5 py-5 text-right align-top">
                    {d.items.length > 0 && <p className="text-sm font-semibold tabular-nums text-text-primary">{peso(d.total)}</p>}
                    {d.discountTotal > 0 && <p className="text-xs tabular-nums text-accent-blue">−{peso(d.discountTotal)} disc.</p>}
                    {d.expenses.length > 0 && <p className="text-xs tabular-nums text-accent-red">−{peso(d.expensesTotal)}</p>}
                    {d.items.length > 0 && d.expenses.length > 0 && (
                      <p className="mt-0.5 text-xs font-semibold tabular-nums text-accent-purple-light">Net {peso(d.total - d.expensesTotal)}</p>
                    )}
                  </td>
                  <td className="px-5 py-5 align-top text-xs text-text-secondary">{formatDate(d.updatedAt)}</td>
                  <td className="px-5 py-5 align-top">
                    <div className="flex flex-col items-stretch gap-2">
                      <DraftIconButton
                        tone="positive"
                        icon={<Send size={15} />}
                        label="Save Draft"
                        armed={confirmAction === `save-draft-${d.staff.id}`}
                        disabled={draftBusy}
                        title="Submit this draft"
                        onClick={() => {
                          if (confirmAction !== `save-draft-${d.staff.id}`) { setConfirmAction(`save-draft-${d.staff.id}`); return; }
                          setConfirmAction(null);
                          runSafe(async () => {
                            const result = await saveDraftForStaff.mutateAsync(d.staff.id);
                            setActionStatus(
                              result.errors.length > 0
                                ? `Saved ${d.staff.name}'s draft with issues: ${result.errors.join('; ')}`
                                : `✓ Saved ${d.staff.name}'s draft — now pending approval.`,
                            );
                          });
                        }}
                      />
                      <DraftIconButton
                        tone="negative"
                        icon={<Trash2 size={15} />}
                        label="Clear"
                        armed={confirmAction === `clear-draft-${d.staff.id}`}
                        disabled={draftBusy}
                        title="Discard this draft (nothing is sold)"
                        onClick={() => handleClearDraft(d.staff.id, d.staff.name)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile: staff-draft cards (hidden on desktop). */}
          <div className="md:hidden">
            {draftsLoading ? (
              <div className="py-6 text-center text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading…</div>
            ) : drafts.length === 0 ? (
              <div className="py-6 text-center text-text-muted">No staff currently building an order.</div>
            ) : (
              <ul className="divide-y divide-card-border">
                {drafts.map((d) => (
                  <li key={d.id} className="p-5">
                    <div className="mb-4">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-text-primary" title={d.staff.name}>{d.staff.name}</p>
                        <p className="mt-0.5 text-[11px] text-text-muted">Updated {formatDate(d.updatedAt)}</p>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <DraftIconButton
                          tone="positive"
                          icon={<Send size={15} />}
                          label="Save Draft"
                          armed={confirmAction === `save-draft-${d.staff.id}`}
                          disabled={draftBusy}
                          title="Submit this draft"
                          onClick={() => {
                            if (confirmAction !== `save-draft-${d.staff.id}`) { setConfirmAction(`save-draft-${d.staff.id}`); return; }
                            setConfirmAction(null);
                            runSafe(async () => {
                              const result = await saveDraftForStaff.mutateAsync(d.staff.id);
                              setActionStatus(
                                result.errors.length > 0
                                  ? `Saved ${d.staff.name}'s draft with issues: ${result.errors.join('; ')}`
                                  : `✓ Saved ${d.staff.name}'s draft — now pending approval.`,
                              );
                            });
                          }}
                        />
                        <DraftIconButton
                          tone="negative"
                          icon={<Trash2 size={15} />}
                          label="Clear"
                          armed={confirmAction === `clear-draft-${d.staff.id}`}
                          disabled={draftBusy}
                          title="Discard this draft (nothing is sold)"
                          onClick={() => handleClearDraft(d.staff.id, d.staff.name)}
                        />
                      </div>
                    </div>
                    <div className="space-y-4">
                      {d.items.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">To Sell</p>
                          <ul className="divide-y divide-card-border/40">
                            {d.items.map((item: any) => (
                              <li key={item.productId} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                                <span className="flex min-w-0 items-center gap-2">
                                  <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-white/10 px-1.5 text-[11px] font-semibold tabular-nums text-text-secondary">{item.quantity}×</span>
                                  <span className="min-w-0 truncate text-sm font-medium text-text-primary" title={item.name}>{item.name}</span>
                                </span>
                                <span className="flex shrink-0 items-center gap-2">
                                  <span className="badge badge-neutral whitespace-nowrap"><span className={`badge-dot ${paymentDotColor(item.paymentMethod)}`} />{itemPaymentLabel(item)}</span>
                                  {item.addedAt && <span className="text-[10px] tabular-nums text-text-muted">{new Date(item.addedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}</span>}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {d.disposalItems.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">To Dispose</p>
                          <ul className="space-y-1.5">
                            {d.disposalItems.map((item) => (
                              <li key={item.productId} className="flex items-center gap-2">
                                <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-white/10 px-1.5 text-[11px] font-semibold tabular-nums text-text-secondary">{item.quantity}×</span>
                                <span className="min-w-0 truncate text-sm text-text-secondary" title={item.name}>{item.name}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {d.expenses.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Expenses</p>
                          <ul className="space-y-1.5">
                            {d.expenses.map((exp, idx) => <li key={idx} className="text-sm"><span className="font-medium tabular-nums text-accent-red">−{peso(exp.amount)}</span>{exp.note && <span className="text-text-muted"> · {exp.note}</span>}</li>)}
                          </ul>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-card-border/60 pt-3 text-sm">
                        {d.items.length > 0 && <span className="font-semibold tabular-nums text-text-primary">{peso(d.total)}</span>}
                        {d.discountTotal > 0 && <span className="tabular-nums text-accent-blue">−{peso(d.discountTotal)} disc.</span>}
                        {d.expenses.length > 0 && <span className="tabular-nums text-accent-red">−{peso(d.expensesTotal)}</span>}
                        {d.items.length > 0 && d.expenses.length > 0 && <span className="font-semibold tabular-nums text-accent-purple-light">Net {peso(d.total - d.expensesTotal)}</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Pending Disposals */}
      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm mt-8">
        <div className="p-4 border-b border-card-border flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
            <Recycle size={18} /> Pending Disposals
            {disposals.length > 0 && <span className="badge badge-neutral">{disposals.length}</span>}
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <BulkActionButton
              tone="positive"
              label="Approve All"
              icon={<CheckCircle size={15} />}
              armed={confirmAction === 'approve-all-disposals'}
              disabled={disposals.length === 0}
              onClick={() => { const n = disposals.length; if (!n) return; if (confirmAction !== 'approve-all-disposals') { setConfirmAction('approve-all-disposals'); return; } setConfirmAction(null); runSafe(async () => { await Promise.all(disposals.map((d) => approveDisposal.mutateAsync(d.id))); setActionStatus(`✓ All ${n} disposal${n === 1 ? '' : 's'} approved (stock deducted).`); }); }}
              onCancel={() => setConfirmAction(null)}
              title="Approve all pending disposals"
            />
            <BulkActionButton
              tone="negative"
              label="Decline All"
              icon={<XCircle size={15} />}
              armed={confirmAction === 'decline-all-disposals'}
              disabled={disposals.length === 0}
              onClick={() => { const n = disposals.length; if (!n) return; if (confirmAction !== 'decline-all-disposals') { setConfirmAction('decline-all-disposals'); return; } setConfirmAction(null); runSafe(async () => { await Promise.all(disposals.map((d) => declineDisposal.mutateAsync(d.id))); setActionStatus(`All ${n} disposal${n === 1 ? '' : 's'} declined.`); }); }}
              onCancel={() => setConfirmAction(null)}
              title="Decline all pending disposals"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="hidden w-full md:table">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase">Product</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase">Brand</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase">Qty</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase">Value</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase">Reason</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase">Requested By</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase">Date</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {dispLoading ? (
                <tr><td colSpan={8} className="text-center py-6 text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading…</td></tr>
              ) : disposals.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-6 text-text-muted">No pending disposals.</td></tr>
              ) : disposals.map((d) => (
                <tr key={d.id} className="border-b border-card-border/60 transition">
                  <td className="px-4 py-4 text-sm text-text-primary">{d.name}</td>
                  <td className="px-4 py-4 text-sm text-text-secondary">{d.brandName}</td>
                  <td className="px-4 py-4 text-sm text-text-primary">{d.quantity}</td>
                  <td className="px-4 py-4 text-sm text-text-primary font-medium">{peso(d.value)}</td>
                  <td className="px-4 py-4 text-sm text-text-secondary max-w-[180px] truncate">{d.reason ?? '—'}</td>
                  <td className="px-4 py-4 text-sm text-text-secondary">{d.createdBy}</td>
                  <td className="px-4 py-4 text-sm text-text-secondary">{formatDate(d.createdAt)}</td>
                  <td className="px-4 py-4">
                    <div className="act-group">
                      <button onClick={() => runSafe(async () => { await approveDisposal.mutateAsync(d.id); setActionStatus(`✓ Disposal of ${d.quantity}× ${d.name} approved (stock deducted).`); })} className="act-btn act-approve" title="Approve"><CheckCircle size={16} /></button>
                      <button onClick={() => runSafe(async () => { await declineDisposal.mutateAsync(d.id); setActionStatus(`Disposal of ${d.name} declined.`); })} className="act-btn act-decline" title="Decline"><XCircle size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile: pending-disposal cards (hidden on desktop). */}
          <div className="md:hidden">
            {dispLoading ? (
              <div className="py-6 text-center text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading…</div>
            ) : disposals.length === 0 ? (
              <div className="py-6 text-center text-text-muted">No pending disposals.</div>
            ) : (
              <ul className="divide-y divide-card-border">
                {disposals.map((d) => (
                  <li key={d.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary break-words">{d.quantity}× {d.name}</p>
                        <p className="text-xs text-text-muted">{d.brandName} · {peso(d.value)}</p>
                        {d.reason && <p className="text-xs text-text-secondary break-words">{d.reason}</p>}
                        <p className="text-[11px] text-text-muted">{d.createdBy} · {formatDate(d.createdAt)}</p>
                      </div>
                      <div className="act-group shrink-0">
                        <button onClick={() => runSafe(async () => { await approveDisposal.mutateAsync(d.id); setActionStatus(`✓ Disposal of ${d.quantity}× ${d.name} approved (stock deducted).`); })} className="act-btn act-approve" title="Approve"><CheckCircle size={16} /></button>
                        <button onClick={() => runSafe(async () => { await declineDisposal.mutateAsync(d.id); setActionStatus(`Disposal of ${d.name} declined.`); })} className="act-btn act-decline" title="Decline"><XCircle size={16} /></button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Pending Expenses */}
      <div className="bg-card-bg rounded-xl border border-card-border shadow-sm mt-8">
        <div className="p-4 border-b border-card-border flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
            <PhilippinePeso size={18} /> Pending Expenses
            {expenses.length > 0 && <span className="badge badge-neutral">{expenses.length}</span>}
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <BulkActionButton
              tone="positive"
              label="Approve All"
              icon={<CheckCircle size={15} />}
              armed={confirmAction === 'approve-all-expenses'}
              disabled={expenses.length === 0}
              onClick={() => { const n = expenses.length; if (!n) return; if (confirmAction !== 'approve-all-expenses') { setConfirmAction('approve-all-expenses'); return; } setConfirmAction(null); runSafe(async () => { await Promise.all(expenses.map((e) => approveExpense.mutateAsync(e.id))); setActionStatus(`✓ All ${n} expense${n === 1 ? '' : 's'} approved.`); }); }}
              onCancel={() => setConfirmAction(null)}
              title="Approve all pending expenses"
            />
            <BulkActionButton
              tone="negative"
              label="Decline All"
              icon={<XCircle size={15} />}
              armed={confirmAction === 'decline-all-expenses'}
              disabled={expenses.length === 0}
              onClick={() => { const n = expenses.length; if (!n) return; if (confirmAction !== 'decline-all-expenses') { setConfirmAction('decline-all-expenses'); return; } setConfirmAction(null); runSafe(async () => { await Promise.all(expenses.map((e) => declineExpense.mutateAsync(e.id))); setActionStatus(`All ${n} expense${n === 1 ? '' : 's'} declined.`); }); }}
              onCancel={() => setConfirmAction(null)}
              title="Decline all pending expenses"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="hidden w-full md:table">
            <thead>
              <tr className="bg-table-header text-table-header-text">
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase">Staff</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase">Amount</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase">Note</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase">Date</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {expLoading ? (
                <tr><td colSpan={5} className="text-center py-6 text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading…</td></tr>
              ) : expenses.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-6 text-text-muted">No pending expenses.</td></tr>
              ) : expenses.map((e) => (
                <tr key={e.id} className="border-b border-card-border/60 transition">
                  <td className="px-4 py-4 text-sm text-text-primary">{e.staff?.name ?? '—'}</td>
                  <td className="px-4 py-4 text-sm text-text-primary font-medium">{peso(e.amount)}</td>
                  <td className="px-4 py-4 text-sm text-text-secondary max-w-[220px] truncate">{e.note}</td>
                  <td className="px-4 py-4 text-sm text-text-secondary">{formatDate(e.createdAt)}</td>
                  <td className="px-4 py-4">
                    <div className="act-group">
                      <button onClick={() => runSafe(async () => { await approveExpense.mutateAsync(e.id); setActionStatus(`✓ Expense "${e.note}" approved.`); })} className="act-btn act-approve" title="Approve"><CheckCircle size={16} /></button>
                      <button onClick={() => runSafe(async () => { await declineExpense.mutateAsync(e.id); setActionStatus(`Expense "${e.note}" declined.`); })} className="act-btn act-decline" title="Decline"><XCircle size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile: pending-expense cards (hidden on desktop). */}
          <div className="md:hidden">
            {expLoading ? (
              <div className="py-6 text-center text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading…</div>
            ) : expenses.length === 0 ? (
              <div className="py-6 text-center text-text-muted">No pending expenses.</div>
            ) : (
              <ul className="divide-y divide-card-border">
                {expenses.map((e) => (
                  <li key={e.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary">{peso(e.amount)}</p>
                        <p className="text-xs text-text-secondary break-words">{e.note}</p>
                        <p className="text-[11px] text-text-muted">{e.staff?.name ?? '—'} · {formatDate(e.createdAt)}</p>
                      </div>
                      <div className="act-group shrink-0">
                        <button onClick={() => runSafe(async () => { await approveExpense.mutateAsync(e.id); setActionStatus(`✓ Expense "${e.note}" approved.`); })} className="act-btn act-approve" title="Approve"><CheckCircle size={16} /></button>
                        <button onClick={() => runSafe(async () => { await declineExpense.mutateAsync(e.id); setActionStatus(`Expense "${e.note}" declined.`); })} className="act-btn act-decline" title="Decline"><XCircle size={16} /></button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {editingSale && (
        <EditSaleModal
          sale={editingSale}
          products={products}
          isSaving={updateSale.isPending}
          onClose={() => setEditingSale(null)}
          onSave={async (payload) => {
            setActionError(null);
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

function EditSaleModal({
  sale,
  products,
  isSaving,
  onClose,
  onSave,
}: {
  sale: Sale;
  products: { id: string; name: string; sellingPrice: number; brand: { name: string } | null }[];
  isSaving: boolean;
  onClose: () => void;
  onSave: (payload: { customerName?: string; items: SaleItemInput[] }) => Promise<void>;
}) {
  const [rows, setRows] = useState<EditRow[]>([]);
  const [customerName, setCustomerName] = useState(sale.customerName ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const guardedClose = useUnsavedGuard(dirty, onClose);

  useEffect(() => {
    // Seed rows from ALL of the sale's current items, resolving each to the
    // live catalog by productId FIRST, then falling back to a name+brand match.
    // The name fallback fixes lines that showed a false "no longer exists":
    // even when a product's id differs from what the sale recorded (e.g. IDs
    // drifted), the same product is re-linked by its name+brand snapshot, so
    // it stays selected and saveable. A line is only truly "missing" when it
    // matches NEITHER id nor name+brand.
    const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();
    setRows(
      sale.items.map((i) => {
        const match =
          (i.productId ? products.find((p) => p.id === i.productId) : undefined) ??
          products.find(
            (p) => norm(p.name) === norm(i.name) && norm(p.brand?.name) === norm(i.brandName),
          );
        return {
          // Use the resolved catalog id when found (so the dropdown pre-selects
          // and save works); otherwise keep the original id for reference.
          productId: match?.id ?? i.productId ?? '',
          quantity: i.quantity,
          discount: i.discount,
          paymentMethod: i.paymentMethod,
          bankNote: i.bankNote,
          note: i.note,
          paymentSplit: i.paymentSplit,
          snapshotName: i.name,
          snapshotBrandName: i.brandName,
          snapshotUnitPrice: i.unitPrice,
          missingProduct: !match,
        };
      }),
    );
    // Re-seed when the sale changes, or once the catalog loads (so the
    // id / name-fallback resolution is accurate).
  }, [sale, products]);

  // Price a row at what was actually charged (the snapshot), falling back to
  // the live catalog price only for a freshly-added row with no snapshot.
  const priceOf = (row: EditRow) => {
    if (row.snapshotUnitPrice != null) return row.snapshotUnitPrice;
    return products.find((p) => p.id === row.productId)?.sellingPrice ?? 0;
  };
  const computedTotal = rows.reduce((sum, r) => sum + priceOf(r) * r.quantity - (r.discount ?? 0), 0);
  const hasMissingProduct = rows.some((r) => r.missingProduct);

  const setRow = (idx: number, patch: Partial<EditRow>) => {
    setDirty(true);
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  // Changing the product re-points a row to a live catalog product: drop the
  // old snapshot so it prices at the newly-selected product's current price,
  // and clear the missing-product flag.
  const changeProduct = (idx: number, productId: string) => {
    setDirty(true);
    setRows((rs) =>
      rs.map((r, i) =>
        i === idx
          ? { ...r, productId, snapshotName: undefined, snapshotBrandName: undefined, snapshotUnitPrice: undefined, missingProduct: false }
          : r,
      ),
    );
  };
  const removeRow = (idx: number) => { setDirty(true); setRows((rs) => rs.filter((_, i) => i !== idx)); };

  const handleSubmit = async () => {
    if (rows.length === 0) { setErr('A sale must have at least one item.'); return; }
    if (rows.some((r) => r.quantity < 1)) { setErr('All quantities must be at least 1.'); return; }
    if (rows.some((r) => !r.productId)) { setErr('Every item must have a product selected.'); return; }
    if (hasMissingProduct) {
      setErr('One or more items point to a product that no longer exists. Remove those lines before saving (or decline the sale and have it resubmitted).');
      return;
    }
    setErr(null);
    try {
      await onSave({
        customerName: customerName.trim() || undefined,
        items: rows.map((r) => ({
          productId: r.productId,
          quantity: r.quantity,
          discount: r.discount ?? undefined,
          paymentMethod: r.paymentMethod,
          bankNote: r.bankNote ?? undefined,
          note: r.note ?? undefined,
          paymentSplit: r.paymentSplit ?? undefined,
        })),
      });
      setDirty(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save sale.');
    }
  };

  return (
    <Modal title={`Edit Sale #${sale.number}`} onClose={guardedClose} size="xl">
      <div className="space-y-4" onInput={() => setDirty(true)}>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Customer (optional)</label>
          <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus" />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-sm font-semibold text-text-primary">Items</label>
            <span className="text-xs text-text-muted">{rows.length} item{rows.length === 1 ? '' : 's'}</span>
          </div>
          <p className="mb-3 text-xs text-text-muted">
            Payment method isn&apos;t editable here — decline the sale and have the staff resubmit it to change how an item was paid.
          </p>

          {/* Column headers (desktop) so each field is labelled and aligned. */}
          <div className="hidden sm:grid sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-center sm:gap-3 px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            <span>Product</span>
            <span className="w-28 text-center">Qty</span>
            <span className="w-28 text-right">Line total</span>
            <span className="w-20 text-center">Payment</span>
            <span className="w-8" />
          </div>

          <div className="space-y-2">
            {rows.length === 0 && (
              <p className="rounded-lg border border-dashed border-card-border px-3 py-4 text-center text-xs text-text-muted">
                No items left. A sale must keep at least one item — cancel to keep the sale as-is.
              </p>
            )}
            {rows.map((row, idx) => {
              const catalogOptions = products.map((p) => ({
                value: p.id,
                label: `${p.name}${p.brand ? ` (${p.brand.name})` : ''} — ${peso(p.sellingPrice)}`,
              }));
              // If this row's product truly isn't in the live catalog (matched
              // neither by id nor name+brand), inject a synthetic option from
              // the sale's own snapshot so the dropdown still shows what was
              // sold instead of appearing blank.
              const options =
                row.productId && !products.some((p) => p.id === row.productId)
                  ? [
                      {
                        value: row.productId,
                        label: `${row.snapshotName ?? 'Unknown product'}${row.snapshotBrandName ? ` (${row.snapshotBrandName})` : ''}${row.snapshotUnitPrice != null ? ` — ${peso(row.snapshotUnitPrice)}` : ''} (no longer available)`,
                      },
                      ...catalogOptions,
                    ]
                  : catalogOptions;
              return (
                <div
                  key={`${row.productId || 'new'}-${idx}`}
                  className={`rounded-xl border p-3 transition sm:grid sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-center sm:gap-3 sm:p-2.5 ${row.missingProduct ? 'border-accent-orange/40 bg-accent-orange/5' : 'border-card-border bg-white/[0.02] hover:bg-white/[0.04]'}`}
                >
                  <div className="mb-2 min-w-0 sm:mb-0">
                    <Select value={row.productId} onChange={(v) => changeProduct(idx, v)} ariaLabel="Product" className="w-full" options={options} />
                    {row.missingProduct && (
                      <p className="mt-1 text-[11px] text-accent-orange">This product no longer exists — remove this line to save, or decline the sale and have it resubmitted.</p>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:contents">
                    <NumberStepper min={1} ariaLabel="Quantity" value={String(row.quantity)} onChange={(v) => setRow(idx, { quantity: parseInt(v) || 1 })} className="w-28 shrink-0 sm:justify-self-center" />
                    <span className="w-28 text-right text-sm font-semibold text-text-primary tabular-nums">{peso(priceOf(row) * row.quantity - (row.discount ?? 0))}</span>
                    <span className="w-20 truncate text-center text-xs text-text-muted" title={row.paymentMethod}>{row.paymentMethod}</span>
                    <button onClick={() => removeRow(idx)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-accent-red transition hover:bg-accent-red/10 sm:justify-self-end" title="Remove item"><Trash2 size={15} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-card-border pt-3">
          <span className="text-sm text-text-muted">New total</span>
          <span className="text-lg font-bold text-text-primary tabular-nums">{peso(computedTotal)}</span>
        </div>

        {err && <p className="rounded-lg border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{err}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={guardedClose} className="px-4 py-2 border border-input-border rounded-lg text-sm text-text-primary hover:opacity-80 transition">Cancel</button>
          <button onClick={handleSubmit} disabled={isSaving} className="btn-grad px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60">
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
