'use client';

import { useState } from 'react';
import { X, Loader2, Undo2 } from 'lucide-react';
import { useStockMovements, useUndoStock } from '@/lib/hooks';
import { useToast } from '@/components/Toast';
import { getApiErrorMessage } from '@/lib/api';
import type { StockMovementType } from '@/lib/types';

function typeLabel(type: StockMovementType): string {
  switch (type) {
    case 'SALE': return 'Added orders.';
    case 'RESTOCK': return 'Restocked product.';
    case 'DISPOSAL': return 'Disposed product.';
    case 'RETURN': return 'Restored product quantity after clearing orders.';
    case 'ADJUSTMENT': return 'Updated quantity.';
    default: return type;
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

interface Props {
  productId: string;
  productName: string;
  branchId: string;
  branchName: string;
  isOwner?: boolean;
  onClose: () => void;
}

// Which movement types an owner may undo from the history.
function isUndoable(m: { type: StockMovementType; description?: string | null }): boolean {
  if (m.type !== 'RESTOCK' && m.type !== 'ADJUSTMENT') return false;
  // A compensating "Undo:" entry is not itself undoable.
  if (m.description && m.description.startsWith('Undo:')) return false;
  return true;
}

export function StockHistoryModal({ productId, productName, branchId, branchName, isOwner, onClose }: Props) {
  const [page, setPage] = useState(1);
  const toast = useToast();
  const undoStock = useUndoStock();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const { data, isLoading } = useStockMovements({ productId, branchId, page, limit: 50 });
  const movements = Array.isArray(data?.data) ? data.data : [];
  const pagination = data?.pagination;

  // Undo is only offered on the single most-recent movement (page 1, first row),
  // and only when it's an owner-undoable type — this mirrors the backend's
  // "must be the latest movement" rule so the button never shows for something
  // that would be refused.
  const latestId = page === 1 && movements.length > 0 ? movements[0].id : null;

  async function handleUndo(id: string) {
    setConfirmId(null);
    try {
      const res = await undoStock.mutateAsync([id]);
      if (res.undone > 0) toast.success('The last stock change was reverted.', 'Undone');
      else toast.error(res.skipped[0]?.reason ?? 'Could not undo.');
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="glass relative rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-4 border-b border-card-border shrink-0">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold text-text-primary" title={`Product Activity Logs — ${productName}`}>Product Activity Logs — {productName}</h3>
            <p className="text-xs text-text-muted mt-0.5 truncate">{branchName}</p>
          </div>
          <button onClick={onClose} className="shrink-0 text-text-muted hover:text-text-primary transition"><X size={20} /></button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="py-10 text-center text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading history...</div>
          ) : movements.length === 0 ? (
            <div className="py-10 text-center text-text-muted">No stock movements recorded for this product at this branch.</div>
          ) : (
            <div className="space-y-3">
              {movements.map((m) => {
                const canUndo = !!isOwner && m.id === latestId && isUndoable(m);
                const afterUndo = m.quantityAfter - m.quantityChange; // reversing this movement
                return (
                <div key={m.id} className="border-b border-card-border pb-3 last:border-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-text-primary">{m.user ?? 'System'}</p>
                    <p className="text-xs text-text-muted whitespace-nowrap">{formatDateTime(m.createdAt)}</p>
                  </div>
                  <p className="text-sm text-text-secondary mt-0.5">{m.description || typeLabel(m.type)}</p>
                  <p className="text-sm mt-0.5">
                    <span className="text-text-secondary">Remaining Quantity: </span>
                    <span className="font-medium text-text-primary">{m.quantityAfter}</span>
                    {' '}
                    <span className={`font-medium ${m.quantityChange > 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                      ({m.quantityChange > 0 ? '+' : ''}{m.quantityChange})
                    </span>
                  </p>
                  {canUndo && (
                    confirmId === m.id ? (
                      <div className="mt-2 rounded-lg border border-accent-orange/30 bg-accent-orange/10 p-2.5">
                        <p className="text-xs text-text-secondary">
                          Undo this change? Quantity will go from <span className="font-semibold text-text-primary">{m.quantityAfter}</span> to <span className="font-semibold text-text-primary">{afterUndo}</span>.
                        </p>
                        <div className="mt-2 flex justify-end gap-2">
                          <button onClick={() => setConfirmId(null)} className="rounded-lg border border-card-border px-3 py-1.5 text-xs text-text-secondary hover:bg-white/5 transition">Cancel</button>
                          <button onClick={() => handleUndo(m.id)} disabled={undoStock.isPending} className="inline-flex items-center gap-1.5 rounded-lg bg-accent-orange px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60">
                            {undoStock.isPending ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />} Yes, undo
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmId(m.id)} className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-accent-blue hover:underline">
                        <Undo2 size={13} /> Undo this
                      </button>
                    )
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 p-3 border-t border-card-border shrink-0">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={!pagination.hasPrev} className="px-3 py-1 text-sm text-text-secondary rounded border border-card-border disabled:opacity-40">Previous</button>
            <span className="text-sm text-text-muted">Page {pagination.page} of {pagination.totalPages}</span>
            <button onClick={() => setPage((p) => p + 1)} disabled={!pagination.hasNext} className="px-3 py-1 text-sm text-text-secondary rounded border border-card-border disabled:opacity-40">Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
