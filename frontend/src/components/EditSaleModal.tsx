'use client';

import { useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { Select } from '@/components/Select';
import { NumberStepper } from '@/components/NumberStepper';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import type { SaleItemInput } from '@/lib/hooks';
import type { Sale, PaymentMethod, PaymentSplit } from '@/lib/types';

function peso(n: number) {
  return `\u20B1${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Local modal (moved here with the Edit Sale modal so both the Owner/Admin
// Pending page and the Staff Daily Report render it identically). `size`
// controls the max width — 'md' for a normal dialog, 'xl' widens it for the
// multi-column item rows. Full-width on mobile, widening from the sm breakpoint.
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

/**
 * Shared modal for editing a PENDING sale — used by the Owner/Admin Pending
 * Sales page and the Staff Daily Report. It edits the customer name and the
 * sale's line items (product, quantity, discount); payment method is not
 * editable here. The parent supplies `onSave`, which is expected to call the
 * update-sale mutation (PATCH /sales/:id). The backend rejects edits of
 * non-pending sales and enforces ownership, so this modal is only mounted for
 * pending sales the actor is allowed to edit.
 */
export function EditSaleModal({
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
