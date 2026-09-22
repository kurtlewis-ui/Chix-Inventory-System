'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Search, X } from 'lucide-react';
import { useBrands, useProducts } from '@/lib/hooks';
import { useAuthStore } from '@/lib/store';
import { useDraftStore } from '@/lib/draft';
import { getApiErrorMessage } from '@/lib/api';
import { GridSkeleton } from '@/components/Skeleton';
import { Select } from '@/components/Select';
import { NumberStepper } from '@/components/NumberStepper';
import { useToast } from '@/components/Toast';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';

function peso(n: number) {
  return `\u20B1${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type StaffProduct = {
  id: string;
  name: string;
  image: string | null;
  sellingPrice: number;
  totalQuantity: number;
  brand: { id: string; name: string } | null;
};

export default function BrandProductsPage() {
  const router = useRouter();
  const params = useParams();
  const brandId = String(params.brandId);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<StaffProduct | null>(null);
  const [cooldown, setCooldown] = useState(false);
  // Id of the product tile to briefly flash green after a successful add,
  // giving an at-the-source "✓ added" confirmation on top of the toast.
  const [flashedId, setFlashedId] = useState<string | null>(null);
  const toast = useToast();

  const user = useAuthStore((s) => s.user);
  const branchId = user?.branch?.id;
  const branchName = user?.branch?.name;

  const { data: brandData } = useBrands();
  const brand = (brandData?.data ?? []).find((b) => b.id === brandId);

  const { data, isLoading, isError, error } = useProducts({ brandId, branchId, search });
  const products = (data?.data ?? []) as StaffProduct[];

  // Draft items for auto-subtracting stock display
  const draftItems = useDraftStore((s) => s.items);
  const draftDisposalItems = useDraftStore((s) => s.disposalItems);

  function getDraftQty(productId: string): number {
    const sellQty = draftItems.filter((i) => i.productId === productId).reduce((sum, i) => sum + i.quantity, 0);
    const disposeQty = draftDisposalItems.find((i) => i.productId === productId)?.quantity ?? 0;
    return sellQty + disposeQty;
  }

  return (
    <div>
      <button
        onClick={() => router.push('/staff')}
        className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-input-border px-3 py-1.5 text-sm text-text-primary hover:opacity-80 transition"
      >
        <ArrowLeft size={15} /> Back
      </button>

      {branchName && (
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1">{branchName}</p>
      )}
      <h1 className="text-2xl font-bold text-text-primary mb-5">{brand?.name ?? 'Products'}</h1>

      <div className="mb-6 flex max-w-2xl items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input-border bg-input-bg py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-input-focus"
          />
        </div>
      </div>

      {!branchId ? (
        <div className="py-16 text-center text-accent-orange">
          Your account is not assigned to a shop. Ask an admin to assign one.
        </div>
      ) : isLoading ? (
        <GridSkeleton count={10} />
      ) : isError ? (
        <div className="py-16 text-center text-accent-red">{getApiErrorMessage(error)}</div>
      ) : products.length === 0 ? (
        <div className="py-16 text-center text-text-muted">No products found for this brand.</div>
      ) : (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {products.map((p) => {
            const draftQty = getDraftQty(p.id);
            const adjustedStock = Math.max(0, p.totalQuantity - draftQty);
            const isOutOfStock = adjustedStock <= 0;
            const isLowStock = !isOutOfStock && adjustedStock <= 5;
            return (
              <button
                key={p.id}
                onClick={() => { if (!isOutOfStock) setSelected(p); }}
                disabled={isOutOfStock}
                aria-disabled={isOutOfStock}
                className={`relative flex flex-col overflow-hidden rounded-xl border bg-card-bg text-left shadow-sm ${
                  flashedId === p.id ? 'flash-success' : ''
                } ${
                  isOutOfStock
                    ? 'tile-disabled border-accent-red/40 opacity-60 grayscale-[40%]'
                    : isLowStock
                    ? 'tile-hover border-accent-orange/40 hover:border-input-focus'
                    : 'tile-hover border-card-border hover:border-input-focus'
                }`}
              >
                {isOutOfStock && (
                  <div className="glow-pulse-red absolute top-2 right-2 z-10 rounded bg-accent-red px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
                    OUT
                  </div>
                )}
                {isLowStock && (
                  <div className="glow-pulse-orange absolute top-2 right-2 z-10 rounded bg-accent-orange px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
                    LOW
                  </div>
                )}
                <div className="flex aspect-square items-center justify-center overflow-hidden bg-card-bg">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-text-muted">No Image Available</span>
                  )}
                </div>
                <div className="px-3 py-3 bg-surface-muted">
                  <p className="truncate text-sm font-semibold text-text-primary" title={p.name}>{p.name}</p>
                  <p className="text-sm font-bold text-text-primary">{peso(p.sellingPrice)}</p>
                  <p className={`text-sm font-medium ${isOutOfStock ? 'text-accent-red' : isLowStock ? 'text-accent-orange' : 'text-text-secondary'}`}>
                    Stock/s: {adjustedStock}
                    {isOutOfStock && ' (Out of stock)'}
                    {isLowStock && ' (Low stock)'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && !cooldown && (
        <AddPurchaseModal
          product={selected}
          onClose={() => setSelected(null)}
          onSaved={(msg) => {
            const savedId = selected?.id ?? null;
            setSelected(null);
            toast.success(msg);
            // Flash the just-added tile green, then clear after the ~800ms
            // animation so it can replay on the next add.
            if (savedId) {
              setFlashedId(savedId);
              setTimeout(() => setFlashedId((cur) => (cur === savedId ? null : cur)), 850);
            }
            setCooldown(true);
            setTimeout(() => setCooldown(false), 1000);
          }}
        />
      )}
    </div>
  );
}

type ItemPaymentMethod = 'Cash' | 'Gcash' | 'Split';

function AddPurchaseModal({
  product,
  onClose,
  onSaved,
}: {
  product: StaffProduct;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [quantity, setQuantity] = useState('1');
  const [discount, setDiscount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<ItemPaymentMethod | ''>('');
  const [splitCash, setSplitCash] = useState('');
  const [splitGcash, setSplitGcash] = useState('');
  const [lastSplitEdited, setLastSplitEdited] = useState<'cash' | 'gcash'>('cash');
  const [note, setNote] = useState('');
  const [disposalReason, setDisposalReason] = useState('');
  const [disposalNote, setDisposalNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const guardedClose = useUnsavedGuard(dirty, onClose);
  const addItem = useDraftStore((s) => s.addItem);
  const addDisposalItem = useDraftStore((s) => s.addDisposalItem);
  const draftItems = useDraftStore((s) => s.items);
  const draftDisposalItems = useDraftStore((s) => s.disposalItems);

  // Units already staged in the draft — whether to sell or to dispose —
  // don't come off the server's stock count until the draft is actually
  // submitted, so both must be subtracted here or staff could stage more
  // than actually exists.
  const alreadyInCart =
    (draftItems.find((i) => i.productId === product.id)?.quantity ?? 0) +
    (draftDisposalItems.find((i) => i.productId === product.id)?.quantity ?? 0);
  const stock = product.totalQuantity;
  const available = Math.max(0, stock - alreadyInCart);

  const qtyNumber = Number(quantity) || 0;
  const lineTotal = product.sellingPrice * qtyNumber;
  const discountNumber = Number(discount) || 0;
  const discountTooHigh = discountNumber > lineTotal + 0.001;
  const discountedTotal = Math.max(0, lineTotal - discountNumber);

  // Keep the split payment balanced when the item total changes (e.g. the user
  // sets the split first, then edits quantity or discount). We recompute the
  // field that was NOT edited last so cash + gcash always equals the current
  // total — avoiding a stale mismatch that would only surface at submit time.
  useEffect(() => {
    if (paymentMethod !== 'Split') return;
    if (lastSplitEdited === 'cash') {
      const cash = Math.min(Number(splitCash) || 0, discountedTotal);
      setSplitGcash(Math.max(0, discountedTotal - cash).toFixed(2));
    } else {
      const gcash = Math.min(Number(splitGcash) || 0, discountedTotal);
      setSplitCash(Math.max(0, discountedTotal - gcash).toFixed(2));
    }
    // Intentionally only re-run when the total or payment mode changes — not on
    // every keystroke in the split fields (those are handled in their onChange).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discountedTotal, paymentMethod]);

  function validQty(): number | null {
    const qty = Number(quantity);
    if (!qty || qty < 1) { setError('Enter a quantity of at least 1.'); return null; }
    if (qty > available) {
      setError(
        alreadyInCart > 0
          ? `Only ${available} more available (${alreadyInCart} already in your draft order).`
          : `Only ${available} in stock at your shop.`,
      );
      return null;
    }
    return qty;
  }

  function handleSaveRecords() {
    setError(null);
    const qty = validQty();
    if (qty === null) return;
    if (!paymentMethod) {
      setError('Please select a payment method.');
      return;
    }
    if (discountTooHigh) {
      setError('Discount can\'t be more than this item\'s total.');
      return;
    }
    if (paymentMethod === 'Split') {
      const cashAmt = Number(splitCash) || 0;
      const gcashAmt = Number(splitGcash) || 0;
      if (Math.abs(cashAmt + gcashAmt - discountedTotal) > 0.01) {
        setError('Split amounts must equal the item total.');
        return;
      }
    }
    addItem(
      {
        productId: product.id,
        name: product.name,
        brandName: product.brand?.name ?? '',
        unitPrice: product.sellingPrice,
        discount: discountNumber,
        paymentMethod,
        bankNote: null,
        note: note.trim() || null,
        paymentSplit:
          paymentMethod === 'Split'
            ? { cash: Number(splitCash) || 0, gcash: Number(splitGcash) || 0 }
            : null,
      },
      qty,
    );
    setDirty(false);
    onSaved(`Added ${qty}× ${product.name} to your draft order.`);
  }

  function handleDispose() {
    setError(null);
    const qty = validQty();
    if (qty === null) return;
    // Combine dropdown reason and note into one string.
    const reasonParts: string[] = [];
    if (disposalReason.trim()) reasonParts.push(disposalReason.trim());
    if (disposalNote.trim()) reasonParts.push(disposalNote.trim());
    const combinedReason = reasonParts.join(' — ') || null;
    addDisposalItem(
      {
        productId: product.id,
        name: product.name,
        brandName: product.brand?.name ?? '',
        reason: combinedReason,
      },
      qty,
    );
    setDirty(false);
    onSaved(`Added ${qty}× ${product.name} to your draft order's Dispose list.`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={guardedClose} />
      {/* max-h + overflow-y-auto so the whole form (incl. Save/Dispose buttons)
          stays reachable on small phone screens; lighter padding on mobile. */}
      <div className="glass relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl p-5 sm:p-8 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-bold text-text-primary">Add Purchase</h3>
          <button onClick={guardedClose} className="text-text-muted hover:text-text-primary transition"><X size={20} /></button>
        </div>

        {/* Product Info Card */}
        <div className="mb-6 flex items-center gap-4 p-4 rounded-lg border border-card-border bg-surface-muted">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-white/10 flex items-center justify-center">
            {product.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.image} alt={product.name} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[9px] text-text-muted">No Img</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-text-primary">{product.name}</p>
            <p className="text-base font-bold text-text-primary">{peso(product.sellingPrice)}</p>
            <p className={`text-sm font-medium ${available <= 0 ? 'text-accent-red' : 'text-text-secondary'}`}>
              Stock/s: {stock}
              {alreadyInCart > 0 && ` (${alreadyInCart} in cart, ${available} available)`}
            </p>
          </div>
        </div>

        <div className="space-y-5" onInput={() => setDirty(true)}>
          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Quantity</label>
            <NumberStepper
              min={1}
              max={available || undefined}
              ariaLabel="Quantity"
              value={quantity}
              onChange={(v) => { setQuantity(v); setDirty(true); }}
              className="w-full"
            />
          </div>

          {/* Discount */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Discount (₱)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2.5 text-sm focus:outline-none focus:border-input-focus"
            />
            {discountNumber > 0 && (
              <p className={`mt-1 text-xs ${discountTooHigh ? 'text-accent-red' : 'text-text-secondary'}`}>
                {discountTooHigh ? "Discount exceeds this item's total." : `Total after discount: ${peso(discountedTotal)}`}
              </p>
            )}
          </div>

          {/* Payment Method — Toggle Buttons */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">Payment Method</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => { setPaymentMethod('Cash'); setDirty(true); }}
                className={`py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  paymentMethod === 'Cash'
                    ? 'bg-btn-primary text-btn-primary-text shadow-md'
                    : 'border-2 border-input-border text-text-primary hover:border-btn-primary'
                }`}
              >
                Cash
              </button>
              <button
                type="button"
                onClick={() => { setPaymentMethod('Gcash'); setDirty(true); }}
                className={`py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  paymentMethod === 'Gcash'
                    ? 'bg-accent-blue text-white shadow-md'
                    : 'border-2 border-input-border text-text-primary hover:border-accent-blue'
                }`}
              >
                Gcash
              </button>
              <button
                type="button"
                onClick={() => { setPaymentMethod('Split'); setDirty(true); }}
                className={`py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  paymentMethod === 'Split'
                    ? 'bg-btn-primary text-btn-primary-text shadow-md'
                    : 'border-2 border-input-border text-text-primary hover:border-btn-primary'
                }`}
              >
                Split
              </button>
            </div>
            {paymentMethod === 'Split' && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Cash (₱)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={splitCash}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSplitCash(val);
                      setLastSplitEdited('cash');
                      const cashVal = Number(val) || 0;
                      setSplitGcash(Math.max(0, discountedTotal - cashVal).toFixed(2));
                    }}
                    placeholder="0"
                    className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm focus:outline-none focus:border-input-focus"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Gcash (₱)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={splitGcash}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSplitGcash(val);
                      setLastSplitEdited('gcash');
                      const gcashVal = Number(val) || 0;
                      setSplitCash(Math.max(0, discountedTotal - gcashVal).toFixed(2));
                    }}
                    placeholder="0"
                    className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm focus:outline-none focus:border-input-focus"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Note (optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note..."
              className="w-full rounded-lg border border-input-border bg-input-bg px-3 py-2.5 text-sm focus:outline-none focus:border-input-focus"
            />
          </div>

          {/* Disposal Reason */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Disposal Reason (if disposing)</label>
            <Select value={disposalReason} onChange={(v) => { setDisposalReason(v); setDirty(true); }} ariaLabel="Disposal reason" placeholder="Select reason..." className="w-full" options={[
              { value: 'Leak', label: 'Leak' },
              { value: 'Damage', label: 'Damage' },
              { value: 'Crack', label: 'Crack' },
              { value: 'Expired', label: 'Expired' },
              { value: 'Burned', label: 'Burned' },
              { value: 'Not Working', label: 'Not Working' },
            ]} />
            <input
              type="text"
              value={disposalNote}
              onChange={(e) => setDisposalNote(e.target.value)}
              placeholder="Add note (optional)"
              className="mt-2 w-full rounded-lg border border-input-border bg-input-bg px-3 py-2.5 text-sm focus:outline-none focus:border-input-focus"
            />
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-accent-red">{error}</p>}

        {/* Action Buttons — Same Size */}
        <div className="grid grid-cols-2 gap-3 mt-6">
          <button
            onClick={handleSaveRecords}
            disabled={available <= 0}
            className="w-full py-2.5 rounded-lg bg-btn-primary text-btn-primary-text text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
          >
            Save Records
          </button>
          <button
            onClick={handleDispose}
            disabled={available <= 0}
            className="w-full py-2.5 rounded-lg bg-accent-red text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
          >
            Dispose
          </button>
        </div>
      </div>
    </div>
  );
}
