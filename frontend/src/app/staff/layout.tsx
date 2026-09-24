'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';
import { useDraftStore, type DraftItem } from '@/lib/draft';
import { useThemeStore } from '@/lib/theme';
import { useSaveDraft, useClearDraftSync, useSaveMyDraft, useMyDraftExists, useMe } from '@/lib/hooks';
import { Select } from '@/components/Select';
import { NumberStepper } from '@/components/NumberStepper';
import { getApiErrorMessage } from '@/lib/api';
import { useToast } from '@/components/Toast';
import type { PaymentMethod, PaymentSplit } from '@/lib/types';
import {
  Home,
  ClipboardList,
  Package,
  Briefcase,
  LogOut,
  X,
  Plus,
  Trash2,
  Recycle,
  Settings as SettingsIcon,
  Edit2,
  Moon,
  Sun,
  Menu,
  PhilippinePeso,
} from 'lucide-react';

function peso(n: number) {
  return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const navItems = [
  { label: 'Home', href: '/staff', icon: <Home size={16} /> },
  { label: 'Daily Reports', href: '/staff/reports', icon: <ClipboardList size={16} /> },
  { label: 'Products', href: '/staff/products', icon: <Package size={16} /> },
];

export default function StaffLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, accessToken, logout, updateUser } = useAuthStore();
  const { contentTheme, toggleContentTheme } = useThemeStore();
  const [mounted, setMounted] = useState(false);
  const [themeAnimKey, setThemeAnimKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  // Keep the staff's profile (esp. their assigned branch) in sync with the
  // server. When an owner/admin reassigns this staff to a different shop, the
  // change is written to the DB immediately but the branch shown here comes
  // from the localStorage-persisted auth store, which otherwise only refreshes
  // on login or a 401-triggered token refresh (up to ~15 min). Polling /auth/me
  // and reconciling the store makes the reassignment show up within seconds.
  const { data: me } = useMe();
  useEffect(() => {
    if (!me) return;
    const branchChanged =
      (me.branch?.id ?? null) !== (user?.branch?.id ?? null);
    const roleChanged = me.role?.name !== user?.role?.name;
    const nameChanged =
      me.firstName !== user?.firstName || me.lastName !== user?.lastName;
    const avatarChanged = me.avatarUrl !== user?.avatarUrl;
    if (branchChanged || roleChanged || nameChanged || avatarChanged) {
      updateUser({
        branch: me.branch ?? null,
        role: me.role,
        firstName: me.firstName,
        lastName: me.lastName,
        middleInitial: me.middleInitial,
        avatarUrl: me.avatarUrl,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  // Close sidebar on navigation
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Auth + role guard: must be logged in and a Staff account.
  useEffect(() => {
    if (!mounted) return;
    if (!accessToken) {
      router.replace('/login');
    } else if (user && user.role?.name !== 'Staff') {
      // Admins/owners belong in the admin dashboard.
      router.replace('/dashboard');
    }
  }, [mounted, accessToken, user, router]);

  function handleLogout() {
    logout();
    router.replace('/login');
  }

  const isActive = (href: string) =>
    href === '/staff' ? pathname === '/staff' : pathname.startsWith(href);

  if (!mounted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-page-bg">
        <p className="text-text-secondary">Loading...</p>
      </main>
    );
  }
  if (!accessToken || (user && user.role?.name !== 'Staff')) {
    return null;
  }

  return (
    <div className="min-h-screen" style={{ background: '#0f0f0f' }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — desktop always visible, mobile slides in. Restrained glass:
          translucent nav tint + blur for depth, keeping the dark identity. */}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[220px] flex-col bg-nav-bg/80 backdrop-blur-xl border-r border-nav-border transition-transform duration-200 md:translate-x-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Logo */}
        <div className="flex items-center gap-4 px-5 py-5 border-b border-nav-border">
          <div className="logo-shimmer rounded-full">
            <img src="/logo.svg" alt="CHX Inventory System" className="h-11 w-11 object-contain" />
          </div>
          <p className="text-base font-bold text-white">CHX Inventory System</p>
        </div>

        {/* Navigation — white active state */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-all ${
                  active
                    ? 'bg-white/10 text-white border-l-[3px] border-white'
                    : 'text-nav-text hover:text-white hover:bg-white/5 border-l-[3px] border-transparent'
                }`}
              >
                <span className={active ? 'text-white' : 'text-[#666666]'}>{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-nav-border px-4 py-4">
          <div className="flex items-center gap-3">
            {user?.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-white/20" />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white ring-1 ring-white/20">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.firstName} {user?.lastName}
              </p>
              {user?.branch?.name && (
                <p className="text-[11px] text-[#666666] truncate">{user.branch.name}</p>
              )}
            </div>
            {/* Theme toggle — in-flow so it never overlaps the name/branch */}
            <button
              onClick={() => { toggleContentTheme(); setThemeAnimKey((k) => k + 1); }}
              className="shrink-0 p-1.5 rounded-lg text-[#999999] hover:text-white hover:bg-white/5 transition-colors"
              title={contentTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle theme"
            >
              <span key={themeAnimKey} className="theme-icon-enter inline-block">
                {contentTheme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
              </span>
            </button>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <Link
              href="/staff/settings"
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-[#999999] hover:text-white hover:bg-white/5 transition-colors"
              title="Settings"
            >
              <SettingsIcon size={14} />
              Settings
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-[#999999] hover:text-[#ef4444] hover:bg-[#ef4444]/10 transition-colors"
              title="Logout"
              aria-label="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-3 bg-[#141414]/95 backdrop-blur-md border-b border-[#2a2a2a]">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-lg text-[#999999] hover:text-white hover:bg-white/5 transition-colors"
          aria-label="Toggle navigation"
        >
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
        <div className="flex items-center gap-3.5">
          <img src="/logo.svg" alt="CHX Inventory System" className="h-8 w-8 rounded-full object-contain" />
          <span className="text-sm font-bold text-white">CHX Inventory System</span>
        </div>
        <div className="w-9" />
      </header>

      {/* Main content — applies theme */}
      <div className={`flex-1 md:ml-[220px] content-transition ${contentTheme === 'light' ? 'content-light' : ''}`}>
        <main className="px-4 py-6 pt-20 sm:px-6 md:pt-6 lg:px-8 max-w-[1200px] xl:max-w-[1440px] mx-auto bg-page-bg min-h-screen">{children}</main>
      </div>

      <DraftBag />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draft order "bag": floating button + slide-in panel with three sections —
// items to sell, items to dispose, and expenses to log. A single "Save
// Order" submits everything together (creates the sale + disposal(s) +
// expense(s), all PENDING, awaiting admin approval).
// ---------------------------------------------------------------------------

// Payment is chosen per item (in the Add Purchase modal), not once for the
// whole order — this renders each item's choice as a small tag.
function paymentTagLabel(item: DraftItem) {
  if (item.paymentMethod === 'Split') return 'Split';
  return item.paymentMethod;
}

// --- Whitelisted draft payload builders -----------------------------------
// The backend rejects any property it doesn't expect (forbidNonWhitelisted).
// Items merged back from the server (e.g. a declined item) can carry extra
// fields, so instead of spreading `...rest` (which forwards unknown props and
// can trigger "property X should not exist"), we build each line explicitly
// with ONLY the fields the server DTO allows.
function toDraftSaleItemPayload(i: any) {
  const out: any = {
    productId: i.productId,
    name: i.name,
    brandName: i.brandName,
    unitPrice: i.unitPrice,
    quantity: i.quantity,
    paymentMethod: i.paymentMethod,
  };
  if (i.image != null) out.image = i.image;
  if (i.discount != null) out.discount = i.discount;
  if (i.bankNote != null) out.bankNote = i.bankNote;
  if (i.note != null) out.note = i.note;
  if (i.addedAt != null) out.addedAt = i.addedAt;
  if (i.paymentSplit != null) {
    out.paymentSplit = {
      cash: i.paymentSplit.cash ?? 0,
      gcash: i.paymentSplit.gcash ?? 0,
      bankTransfer: i.paymentSplit.bankTransfer ?? 0,
      cashless: i.paymentSplit.cashless ?? 0,
    };
  }
  return out;
}

function toDraftDisposalItemPayload(d: any) {
  const out: any = {
    productId: d.productId,
    name: d.name,
    brandName: d.brandName,
    quantity: d.quantity,
  };
  if (d.image != null) out.image = d.image;
  if (d.reason != null) out.reason = d.reason;
  if (d.addedAt != null) out.addedAt = d.addedAt;
  return out;
}

function toDraftExpensePayload(e: any) {
  const out: any = { amount: e.amount, note: e.note };
  if (e.addedAt != null) out.addedAt = e.addedAt;
  return out;
}

// Formats the split amounts as a single line, hiding zero values.
function splitBreakdownLine(split: PaymentSplit): string {
  const parts: string[] = [];
  if (split.cash > 0) parts.push(`₱${split.cash.toLocaleString(undefined, { minimumFractionDigits: 2 })} Cash`);
  if (split.gcash > 0) parts.push(`₱${split.gcash.toLocaleString(undefined, { minimumFractionDigits: 2 })} Gcash`);
  return parts.join(' · ') || '—';
}

// Formats addedAt timestamp in 12-hour format.
function formatAddedTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
}

function DraftBag() {
  const router = useRouter();
  const { contentTheme } = useThemeStore();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const {
    items,
    setQuantity,
    removeItem,
    updateItemPayment,
    disposalItems,
    setDisposalQuantity,
    removeDisposalItem,
    expenses,
    addExpense,
    removeExpense,
    customerName,
    clear,
    removedProductIds,
    clearTombstones,
  } = useDraftStore();
  const toast = useToast();
  const [addingExpense, setAddingExpense] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseNote, setExpenseNote] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [editingPaymentIdx, setEditingPaymentIdx] = useState<number | null>(null);
  const saveDraft = useSaveDraft();
  const clearDraftSync = useClearDraftSync();
  const saveMyDraft = useSaveMyDraft();
  const { data: myDraftExists } = useMyDraftExists();

  useEffect(() => setMounted(true), []);

  const isEmpty = items.length === 0 && disposalItems.length === 0 && expenses.length === 0;


  // Push the cart to the server (debounced) so Admins can see it live on
  // Pending Sales before it's ever submitted. Skips the initial mount so an
  // empty cart on page load doesn't fire a pointless clear.
  const didMount = useRef(false);
  const lastLocalEditAt = useRef(0);
  // Set right before a clear() that already told the server directly
  // (handleSave's saveMyDraft, handleClear's clearDraftSync, or the
  // "admin submitted my draft" cleanup below) — skips this effect's own
  // redundant follow-up sync for that change.
  const suppressNextSync = useRef(false);
  useEffect(() => {
    lastLocalEditAt.current = Date.now();
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    if (suppressNextSync.current) {
      suppressNextSync.current = false;
      return;
    }
    const timer = setTimeout(() => {
      if (isEmpty) {
        // Cart is empty locally → remove the server-side mirror. The staff's
        // local cart is the single source of truth; the server draft only
        // exists so an admin can see the in-progress cart on Pending Sales.
        clearDraftSync.mutate();
        if (removedProductIds.length > 0) clearTombstones();
      } else {
        // One-directional push: the local cart REPLACES the server draft.
        // We deliberately do NOT merge server items back into the local cart.
        //
        // Why: when an admin submits/declines, the server draft is deleted
        // (submit) and never re-created (decline) — a declined sale leaves NO
        // draft behind, on purpose, so the staff re-inputs it. Merging server
        // state back in used to try to "adopt" items from a non-existent
        // decline-restore feature, which could resurrect items the staff
        // didn't intend. Keeping the push strictly local → server makes the
        // behavior deterministic and matches the rule: declined = gone.
        const pushedProductIds = new Set([
          ...items.map((i) => i.productId),
          ...disposalItems.map((i) => i.productId),
        ]);
        const staleTombstones = removedProductIds.filter((pid) => !pushedProductIds.has(pid));
        saveDraft.mutate(
          {
            items: items.map(toDraftSaleItemPayload),
            disposalItems: disposalItems.map(toDraftDisposalItemPayload),
            expenses: expenses.map(toDraftExpensePayload),
            customerName: customerName.trim() || undefined,
          },
          {
            onSuccess: () => {
              if (staleTombstones.length > 0) clearTombstones(staleTombstones);
            },
          },
        );
      }
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, disposalItems, expenses, customerName]);

  // If the server-side draft disappeared while we weren't actively editing
  // (nothing changed locally in the last few seconds), it wasn't us — an
  // admin must have submitted it on our behalf via "Save Draft". Clear the
  // stale local copy so we don't resubmit those same items as duplicates.
  useEffect(() => {
    if (!myDraftExists || myDraftExists.exists || isEmpty) return;
    if (Date.now() - lastLocalEditAt.current < 3000) return;
    suppressNextSync.current = true;
    clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myDraftExists]);


  const itemsTotal = useMemo(
    () => items.reduce((sum, i) => sum + i.unitPrice * i.quantity - (i.discount ?? 0), 0),
    [items],
  );
  // Total discount staged in the cart (Σ per-item discount). Display only —
  // itemsTotal above is already net of it, so nothing is double-counted.
  const itemsDiscountTotal = useMemo(
    () => items.reduce((sum, i) => sum + (i.discount ?? 0), 0),
    [items],
  );
  const expensesTotal = useMemo(
    () => expenses.reduce((sum, e) => sum + e.amount, 0),
    [expenses],
  );
  // Live rollup of what's staged so far, by payment method — splits an
  // item's Split-payment breakdown across its buckets. Line totals are
  // net of each item's discount.
  const paymentTotals = useMemo(() => {
    const totals = { cash: 0, gcash: 0, bankTransfer: 0, cashless: 0 };
    for (const item of items) {
      const lineTotal = item.unitPrice * item.quantity - (item.discount ?? 0);
      if (item.paymentMethod === 'Split' && item.paymentSplit) {
        totals.cash += item.paymentSplit.cash ?? 0;
        totals.gcash += item.paymentSplit.gcash ?? 0;
        totals.bankTransfer += item.paymentSplit.bankTransfer ?? 0;
        totals.cashless += item.paymentSplit.cashless ?? 0;
      } else if (item.paymentMethod === 'Cash') totals.cash += lineTotal;
      else if (item.paymentMethod === 'Gcash') totals.gcash += lineTotal;
      else if (item.paymentMethod === 'BankTransfer') totals.bankTransfer += lineTotal;
      else if (item.paymentMethod === 'Cashless') totals.cashless += lineTotal;
    }
    return totals;
  }, [items]);
  const count =
    items.reduce((sum, i) => sum + i.quantity, 0) +
    disposalItems.reduce((sum, i) => sum + i.quantity, 0) +
    expenses.length;

  async function handleSave() {
    if (isEmpty) return;
    try {
      // Flush the very latest state to the server first — the debounced sync
      // above may not have fired yet if the staff edited and immediately hit
      // Save — then ask the server to submit whatever it has on file.
      await saveDraft.mutateAsync({
        items: items.map(toDraftSaleItemPayload),
        disposalItems: disposalItems.map(toDraftDisposalItemPayload),
        expenses: expenses.map(toDraftExpensePayload),
        customerName: customerName.trim() || undefined,
      });
      const result = await saveMyDraft.mutateAsync();
      suppressNextSync.current = true;
      clear();
      if (result.errors.length > 0) {
        // Whatever succeeded is already submitted; only the failed part (if
        // any) is still sitting in the server-side draft for a retry later —
        // stay put so the staff can see what failed instead of navigating
        // away from it.
        toast.error(`Some items couldn't be submitted: ${result.errors.join('; ')}`, 'Partly submitted');
      } else {
        toast.success('Order submitted! It now awaits admin approval.', 'Order submitted');
        setOpen(false);
        router.push('/staff/reports');
      }
    } catch (e) {
      toast.error(getApiErrorMessage(e), "Couldn't save order");
    }
  }

  function handleClear() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setConfirmClear(false);
    suppressNextSync.current = true;
    clear();
    clearDraftSync.mutate();
    toast.success('Draft cleared', 'Draft cleared');
  }

  function handleAddExpense() {
    const amount = Number(expenseAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid expense amount.', 'Invalid expense');
      return;
    }
    if (!expenseNote.trim()) {
      toast.error('Add a note for the expense.', 'Invalid expense');
      return;
    }
    addExpense({ amount, note: expenseNote.trim() });
    setExpenseAmount('');
    setExpenseNote('');
    setAddingExpense(false);
  }

  const isSaving = saveDraft.isPending || saveMyDraft.isPending;

  return (
    <>
      {/* Floating button — themed */}
      <button
        onClick={() => { setOpen((o) => !o); }}
        className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg shadow-black/30 hover:opacity-90 transition ${contentTheme === 'light' ? 'bg-black text-white' : 'bg-white text-black'}`}
        title="Draft order"
        aria-label="Draft order"
      >
        <Briefcase size={22} />
        {mounted && count > 0 && (
          <span className="absolute -top-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-accent-red px-1.5 text-xs font-bold text-white">
            {count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className={`glass-strong fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col border-l shadow-2xl content-transition ${contentTheme === 'light' ? 'content-light' : ''}`}>
            <div className="flex items-center justify-between border-b border-card-border p-4">
              <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                <Briefcase size={18} /> Draft Order
              </h3>
              <button onClick={() => setOpen(false)} className="text-text-muted hover:text-text-primary transition">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* To Sell */}
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  <Briefcase size={13} /> To Sell
                </h4>
                {items.length === 0 ? (
                  <div className="rounded-lg border border-card-border bg-white/5 px-4 py-3 text-center text-sm text-text-muted">
                    No items yet.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {items.map((item, idx) => (
                      <div key={`${item.productId}-${idx}`} className="rounded-lg border border-card-border p-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-text-primary">{item.name}</p>
                            <p className="text-xs text-text-muted">{item.brandName}</p>
                          </div>
                          <span className="text-[10px] text-text-muted whitespace-nowrap ml-2">{formatAddedTime(item.addedAt)}</span>
                        </div>
                        <p className="text-xs text-text-secondary">
                          {peso(item.unitPrice)} each &middot; {peso(item.unitPrice * item.quantity - (item.discount ?? 0))} total
                        </p>
                        {!!item.discount && <p className="text-[9px] text-accent-orange">(−{peso(item.discount)} discount)</p>}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-block rounded border border-input-border bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-text-primary">{paymentTagLabel(item)}</span>
                            <button
                              onClick={() => setEditingPaymentIdx(editingPaymentIdx === idx ? null : idx)}
                              className="text-[10px] text-accent-blue hover:underline"
                              title="Edit payment method"
                            >
                              <Edit2 size={10} />
                            </button>
                          </div>
                          <div className="flex items-center gap-1">
                            <NumberStepper
                              min={1}
                              ariaLabel="Quantity"
                              value={String(item.quantity)}
                              onChange={(v) => setQuantity(item.id, parseInt(v) || 1)}
                              className="w-28"
                            />
                            <button onClick={() => removeItem(item.id)} className="rounded p-1.5 text-accent-red hover:bg-accent-red/10 ml-1" title="Remove"><Trash2 size={15} /></button>
                          </div>
                        </div>
                        {item.paymentMethod === 'Split' && item.paymentSplit && (
                          <p className="text-[10px] text-text-secondary">{splitBreakdownLine(item.paymentSplit)}</p>
                        )}
                        {editingPaymentIdx === idx && (
                          <EditPaymentInline
                            item={item}
                            onSave={(updates) => { updateItemPayment(item.id, updates); setEditingPaymentIdx(null); }}
                            onCancel={() => setEditingPaymentIdx(null)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* To Dispose */}
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  <Recycle size={13} /> To Dispose
                </h4>
                {disposalItems.length === 0 ? (
                  <div className="rounded-lg border border-card-border bg-white/5 px-4 py-3 text-center text-sm text-text-muted">
                    No items staged for disposal.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {disposalItems.map((item) => (
                      <div key={item.productId} className="rounded-lg border border-card-border p-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-text-primary">{item.name}</p>
                            <p className="text-xs text-text-muted">{item.brandName}</p>
                          </div>
                          {item.addedAt && (
                            <span className="text-[10px] text-text-muted whitespace-nowrap ml-2">{formatAddedTime(item.addedAt)}</span>
                          )}
                        </div>
                        {item.reason && (
                          <p className="text-xs text-accent-red">{item.reason}</p>
                        )}
                        <div className="flex items-center justify-end gap-1">
                          <NumberStepper
                            min={1}
                            ariaLabel="Disposal quantity"
                            value={String(item.quantity)}
                            onChange={(v) => setDisposalQuantity(item.id, parseInt(v) || 1)}
                            className="w-28"
                          />
                          <button onClick={() => removeDisposalItem(item.id)} className="rounded p-1.5 text-accent-red hover:bg-accent-red/10 ml-1" title="Remove"><Trash2 size={15} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Expenses */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                    <PhilippinePeso size={13} /> Expenses
                  </h4>
                  {!addingExpense && (
                    <button
                      onClick={() => setAddingExpense(true)}
                      className="flex items-center gap-1 text-xs font-medium text-accent-blue hover:underline"
                    >
                      <Plus size={13} /> Add Expense
                    </button>
                  )}
                </div>

                {expenses.length === 0 && !addingExpense && (
                  <div className="rounded-lg border border-card-border bg-white/5 px-4 py-3 text-center text-sm text-text-muted">
                    No expenses logged.
                  </div>
                )}

                {expenses.length > 0 && (
                  <div className="space-y-2 mb-2">
                    {expenses.map((exp, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-lg border border-card-border p-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text-primary">{peso(exp.amount)}</p>
                          <p className="truncate text-xs text-text-muted">{exp.note}</p>
                          {exp.addedAt && <p className="text-[10px] text-text-muted">{formatAddedTime(exp.addedAt)}</p>}
                        </div>
                        <button onClick={() => removeExpense(idx)} className="rounded p-1.5 text-accent-red hover:bg-accent-red/10" title="Remove"><Trash2 size={15} /></button>
                      </div>
                    ))}
                  </div>
                )}

                {addingExpense && (
                  <div className="rounded-lg border border-card-border p-3 space-y-2">
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1">Amount (₱)</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={expenseAmount}
                        onChange={(e) => setExpenseAmount(e.target.value)}
                        placeholder="0"
                        className="w-full rounded border border-input-border bg-input-bg px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-text-secondary mb-1">Note</label>
                      <input
                        type="text"
                        value={expenseNote}
                        onChange={(e) => setExpenseNote(e.target.value)}
                        placeholder="Enter note"
                        className="w-full rounded border border-input-border bg-input-bg px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setAddingExpense(false); setExpenseAmount(''); setExpenseNote(''); }}
                        className="flex-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-white/15 transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAddExpense}
                        className="flex-1 rounded-lg bg-btn-primary px-3 py-1.5 text-xs font-medium text-btn-primary-text hover:opacity-90 transition"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>

            {!isEmpty && (
              // shrink-0 so this footer always keeps its space and the scroll
              // area above yields instead — this is what guarantees the
              // Clear/Save buttons below stay on screen no matter how many
              // items are in the cart or how short the device is.
              // The whole footer is capped and split into a SCROLLABLE summary
              // + a PINNED action row. On short screens (small phones, landscape,
              // on-screen keyboard open) the summary scrolls internally while the
              // Clear/Save buttons stay fixed at the bottom — so they can never be
              // pushed off-screen, no matter how many items are in the cart.
              <div className="shrink-0 flex max-h-[60vh] flex-col border-t border-card-border">
                <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
                {/* Items Summary — its own inner scroll cap so a long product
                    list stays compact within the (already scrollable) summary. */}
                {items.length > 0 && (
                  <div className="text-xs pb-3 border-b border-card-border">
                    <p className="font-semibold text-text-primary text-sm mb-2">Items Summary</p>
                    <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
                      {Object.entries(
                        items.reduce<Record<string, number>>((acc, i) => {
                          acc[i.name] = (acc[i.name] ?? 0) + i.quantity;
                          return acc;
                        }, {})
                      ).map(([name, qty]) => (
                        <div key={name} className="flex items-center justify-between">
                          <span className="text-text-secondary truncate">{name}</span>
                          <span className="text-text-primary font-medium">× {qty}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between pt-2 mt-1">
                      <span className="text-text-secondary font-medium">Total Items</span>
                      <span className="text-text-primary font-bold">{items.reduce((s, i) => s + i.quantity, 0)}</span>
                    </div>
                  </div>
                )}
                <div className="space-y-2 text-sm">
                  {items.length > 0 && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-text-primary">Total Sales</span>
                        <span className="font-bold text-text-primary">{peso(itemsTotal)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-text-secondary">Total Cash</span>
                        <span className="text-text-primary">{peso(paymentTotals.cash)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-text-secondary">Total Gcash</span>
                        <span className="text-text-primary">{peso(paymentTotals.gcash)}</span>
                      </div>
                      {paymentTotals.bankTransfer > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-text-secondary">Total Bank Transfer</span>
                          <span className="text-text-primary">{peso(paymentTotals.bankTransfer)}</span>
                        </div>
                      )}
                      {paymentTotals.cashless > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-text-secondary">Total Cashless</span>
                          <span className="text-text-primary">{peso(paymentTotals.cashless)}</span>
                        </div>
                      )}
                      {itemsDiscountTotal > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-text-secondary">Total Discount</span>
                          <span className="text-text-primary">{peso(itemsDiscountTotal)}</span>
                        </div>
                      )}
                    </>
                  )}
                  {expenses.length > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">Total Expenses</span>
                      <span className="font-medium text-text-primary">{peso(expensesTotal)}</span>
                    </div>
                  )}
                  {items.length > 0 && (
                    <div className="flex items-center justify-between border-t border-card-border pt-2 mt-2">
                      <span className="font-bold text-text-primary">Total Net Sales</span>
                      <span className="font-bold text-text-primary">{peso(itemsTotal - expensesTotal)}</span>
                    </div>
                  )}
                </div>
                </div>
                {/* Pinned action row — always visible, never scrolls away. */}
                <div className="shrink-0 border-t border-card-border p-4 grid grid-cols-2 gap-3">
                  {confirmClear ? (
                    <>
                      <button onClick={handleClear} className="confirm-enter w-full rounded-lg bg-accent-red px-3 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition">Yes, Clear</button>
                      <button onClick={() => setConfirmClear(false)} className="confirm-enter w-full rounded-lg border-2 border-input-border px-3 py-2.5 text-sm font-semibold text-text-primary hover:opacity-80 transition">Cancel</button>
                    </>
                  ) : (
                    <>
                      <button onClick={handleClear} disabled={isSaving} className="w-full rounded-lg border-2 border-input-border px-4 py-2.5 text-sm font-semibold text-text-primary hover:opacity-80 transition disabled:opacity-60">Clear</button>
                      <button onClick={handleSave} disabled={isSaving} className="w-full bg-btn-primary text-btn-primary-text rounded-lg px-4 py-2.5 text-sm font-semibold hover:opacity-90 active:scale-[0.97] transition disabled:opacity-60">
                        {isSaving ? 'Saving...' : 'Save Order'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}


// Inline editor for changing an item's payment method without removing it.
function EditPaymentInline({
  item,
  onSave,
  onCancel,
}: {
  item: DraftItem;
  onSave: (updates: { paymentMethod: PaymentMethod; bankNote?: string | null; paymentSplit?: PaymentSplit | null }) => void;
  onCancel: () => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>(item.paymentMethod);
  const [splitCash, setSplitCash] = useState(String(item.paymentSplit?.cash ?? ''));
  const [splitGcash, setSplitGcash] = useState(String(item.paymentSplit?.gcash ?? ''));
  const [splitBank, setSplitBank] = useState(String(item.paymentSplit?.bankTransfer ?? ''));
  // Bank reference/note — used for Bank Transfer (and for a Split that includes
  // a bank-transfer portion). Optional free text (e.g. which bank / ref no.).
  const [bankNote, setBankNote] = useState(item.bankNote ?? '');

  const lineTotal = item.unitPrice * item.quantity - (item.discount ?? 0);

  function peso(n: number) {
    return `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // For a Split, the three entered buckets (cash/gcash/bankTransfer) must not
  // exceed the line total; the backend treats whatever is left over as the
  // generic "cashless" remainder. We surface that remainder + an over-allocation
  // warning so staff can see exactly how the line is being paid.
  const splitCashN = Number(splitCash) || 0;
  const splitGcashN = Number(splitGcash) || 0;
  const splitBankN = Number(splitBank) || 0;
  const allocated = splitCashN + splitGcashN + splitBankN;
  const remainder = lineTotal - allocated;
  const overAllocated = allocated > lineTotal + 0.001;

  function handleSave() {
    const usesBank = method === 'BankTransfer' || method === 'Split';
    onSave({
      paymentMethod: method,
      bankNote: usesBank ? (bankNote.trim() || null) : null,
      paymentSplit:
        method === 'Split'
          ? {
              cash: splitCashN,
              gcash: splitGcashN,
              bankTransfer: splitBankN,
              // Remainder mirrors the server, which recomputes cashless as
              // subTotal − (cash + gcash + bankTransfer). Never negative.
              cashless: Math.max(0, remainder),
            }
          : null,
    });
  }

  return (
    <div className="mt-2 rounded border border-card-border bg-white/5 p-2 space-y-2">
      <Select value={method} onChange={(v) => setMethod(v as PaymentMethod)} ariaLabel="Payment method" className="w-full" options={[
        { value: 'Cash', label: 'Cash' },
        { value: 'Gcash', label: 'Gcash' },
        { value: 'BankTransfer', label: 'Bank Transfer' },
        { value: 'Split', label: 'Split Payment' },
      ]} />
      {method === 'BankTransfer' && (
        <div>
          <label className="block text-[10px] text-text-muted">Bank / reference (optional)</label>
          <input type="text" value={bankNote} onChange={(e) => setBankNote(e.target.value)} placeholder="e.g. BPI · ref 12345" className="w-full rounded border border-input-border bg-input-bg px-1.5 py-0.5 text-xs" />
        </div>
      )}
      {method === 'Split' && (
        <div className="space-y-1">
          <div className="grid grid-cols-3 gap-1">
            <div>
              <label className="block text-[10px] text-text-muted">Cash</label>
              <input type="number" min="0" step="0.01" value={splitCash} onChange={(e) => setSplitCash(e.target.value)} className="w-full rounded border border-input-border bg-input-bg px-1.5 py-0.5 text-xs" />
            </div>
            <div>
              <label className="block text-[10px] text-text-muted">Gcash</label>
              <input type="number" min="0" step="0.01" value={splitGcash} onChange={(e) => setSplitGcash(e.target.value)} className="w-full rounded border border-input-border bg-input-bg px-1.5 py-0.5 text-xs" />
            </div>
            <div>
              <label className="block text-[10px] text-text-muted">Bank</label>
              <input type="number" min="0" step="0.01" value={splitBank} onChange={(e) => setSplitBank(e.target.value)} className="w-full rounded border border-input-border bg-input-bg px-1.5 py-0.5 text-xs" />
            </div>
          </div>
          {splitBankN > 0 && (
            <div>
              <label className="block text-[10px] text-text-muted">Bank / reference (optional)</label>
              <input type="text" value={bankNote} onChange={(e) => setBankNote(e.target.value)} placeholder="e.g. BPI · ref 12345" className="w-full rounded border border-input-border bg-input-bg px-1.5 py-0.5 text-xs" />
            </div>
          )}
          <p className={`text-[10px] ${overAllocated ? 'text-accent-red' : 'text-text-muted'}`}>
            {overAllocated
              ? `Over by ${peso(allocated - lineTotal)} — total is ${peso(lineTotal)}`
              : `Remaining (unspecified): ${peso(Math.max(0, remainder))} of ${peso(lineTotal)}`}
          </p>
        </div>
      )}
      <div className="flex gap-1.5">
        <button onClick={onCancel} className="flex-1 rounded bg-white/10 px-2 py-1 text-[10px] font-medium text-text-primary hover:bg-white/15">Cancel</button>
        <button onClick={handleSave} disabled={method === 'Split' && overAllocated} className="flex-1 rounded bg-btn-primary px-2 py-1 text-[10px] font-medium text-btn-primary-text hover:opacity-90 disabled:opacity-50">Save</button>
      </div>
    </div>
  );
}
