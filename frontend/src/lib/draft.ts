'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PaymentMethod, PaymentSplit } from './types';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// A single line in the staff's draft order (the "bag").
export interface DraftItem {
  id: string;
  productId: string;
  name: string;
  brandName: string;
  unitPrice: number;
  quantity: number;
  discount?: number;
  paymentMethod: PaymentMethod;
  bankNote?: string | null;
  note?: string | null;
  paymentSplit?: PaymentSplit | null;
  addedAt?: string;
}

export interface DraftDisposalItem {
  id: string;
  productId: string;
  name: string;
  brandName: string;
  quantity: number;
  reason?: string | null;
  addedAt?: string;
}

export interface DraftExpense {
  amount: number;
  note: string;
  addedAt?: string;
}

interface DraftState {
  items: DraftItem[];
  disposalItems: DraftDisposalItem[];
  expenses: DraftExpense[];
  customerName: string;
  // "Tombstones": productIds the user has intentionally removed (via the
  // delete button or Clear) since the last successful server sync. The
  // debounced sync effect merges server-side items that are "missing"
  // locally back in (to recover admin-declined items) — but a just-removed
  // item is also "missing" locally, and if the my-draft-exists poll is
  // still holding a stale snapshot it would get resurrected. Skipping any
  // productId listed here prevents that. Tombstones are cleared once the
  // server confirms it no longer holds them.
  removedProductIds: string[];
  addItem: (item: Omit<DraftItem, 'id' | 'quantity' | 'addedAt'>, quantity?: number) => void;
  setQuantity: (id: string, quantity: number) => void;
  removeItem: (id: string) => void;
  updateItemPayment: (id: string, updates: {
    paymentMethod: PaymentMethod;
    bankNote?: string | null;
    paymentSplit?: PaymentSplit | null;
  }) => void;
  addDisposalItem: (item: Omit<DraftDisposalItem, 'id' | 'quantity'>, quantity?: number) => void;
  setDisposalQuantity: (id: string, quantity: number) => void;
  removeDisposalItem: (id: string) => void;
  addExpense: (expense: DraftExpense) => void;
  removeExpense: (index: number) => void;
  setCustomerName: (name: string) => void;
  clear: () => void;
  replaceAll: (items: DraftItem[], disposalItems: DraftDisposalItem[], expenses: DraftExpense[]) => void;
  clearTombstones: (productIds?: string[]) => void;
}

export const useDraftStore = create<DraftState>()(
  persist(
    (set) => ({
      items: [],
      disposalItems: [],
      expenses: [],
      customerName: '',
      removedProductIds: [],
      addItem: (item, quantity = 1) =>
        set((state) => ({
          items: [...state.items, { ...item, id: generateId(), quantity, addedAt: new Date().toISOString() }],
          // Re-adding a product cancels any prior tombstone for it.
          removedProductIds: state.removedProductIds.filter((pid) => pid !== item.productId),
        })),
      setQuantity: (id, quantity) =>
        set((state) => ({
          items: state.items.map((i) => {
            if (i.id !== id) return i;
            const newQty = Math.max(1, quantity);
            if (i.paymentMethod === 'Split' && i.paymentSplit && newQty !== i.quantity) {
              return { ...i, quantity: newQty, paymentMethod: 'Cash' as PaymentMethod, paymentSplit: null };
            }
            return { ...i, quantity: newQty };
          }),
        })),
      removeItem: (id) =>
        set((state) => {
          const removed = state.items.find((i) => i.id === id);
          const items = state.items.filter((i) => i.id !== id);
          if (!removed) return { items };
          // Only tombstone the productId if nothing else in the draft (a
          // remaining sell line or a disposal line) still references it —
          // otherwise the merge would wrongly drop that still-present line.
          const stillReferenced =
            items.some((i) => i.productId === removed.productId) ||
            state.disposalItems.some((d) => d.productId === removed.productId);
          if (stillReferenced) return { items };
          return {
            items,
            removedProductIds: state.removedProductIds.includes(removed.productId)
              ? state.removedProductIds
              : [...state.removedProductIds, removed.productId],
          };
        }),

      updateItemPayment: (id, updates) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.id === id ? { ...i, ...updates } : i,
          ),
        })),

      addDisposalItem: (item, quantity = 1) =>
        set((state) => {
          // Re-adding a product cancels any prior tombstone for it.
          const removedProductIds = state.removedProductIds.filter((pid) => pid !== item.productId);
          const existing = state.disposalItems.find((i) => i.productId === item.productId);
          if (existing) {
            return {
              removedProductIds,
              disposalItems: state.disposalItems.map((i) =>
                i.productId === item.productId
                  ? { ...i, quantity: i.quantity + quantity }
                  : i,
              ),
            };
          }
          return {
            removedProductIds,
            disposalItems: [...state.disposalItems, { ...item, id: generateId(), quantity, addedAt: new Date().toISOString() }],
          };
        }),
      setDisposalQuantity: (id, quantity) =>
        set((state) => ({
          disposalItems: state.disposalItems.map((i) =>
            i.id === id ? { ...i, quantity: Math.max(1, quantity) } : i,
          ),
        })),
      removeDisposalItem: (id) =>
        set((state) => {
          const removed = state.disposalItems.find((i) => i.id === id);
          const disposalItems = state.disposalItems.filter((i) => i.id !== id);
          if (!removed) return { disposalItems };
          const stillReferenced =
            state.items.some((i) => i.productId === removed.productId) ||
            disposalItems.some((d) => d.productId === removed.productId);
          if (stillReferenced) return { disposalItems };
          return {
            disposalItems,
            removedProductIds: state.removedProductIds.includes(removed.productId)
              ? state.removedProductIds
              : [...state.removedProductIds, removed.productId],
          };
        }),

      addExpense: (expense) => set((state) => ({ expenses: [...state.expenses, { ...expense, addedAt: new Date().toISOString() }] })),
      removeExpense: (index) =>
        set((state) => ({ expenses: state.expenses.filter((_, i) => i !== index) })),

      setCustomerName: (name) => set({ customerName: name }),

      clear: () =>
        set((state) => {
          // Tombstone every productId currently in the draft so a stale
          // my-draft-exists poll can't resurrect them into an empty cart
          // before the server's delete is reflected.
          const cleared = new Set(state.removedProductIds);
          for (const i of state.items) cleared.add(i.productId);
          for (const d of state.disposalItems) cleared.add(d.productId);
          return {
            items: [],
            disposalItems: [],
            expenses: [],
            customerName: '',
            removedProductIds: Array.from(cleared),
          };
        }),

      replaceAll: (items, disposalItems, expenses) => set({ items, disposalItems, expenses }),

      // Drop tombstones once the server confirms it no longer holds them (or
      // all of them, when called with no argument).
      clearTombstones: (productIds) =>
        set((state) => ({
          removedProductIds: productIds
            ? state.removedProductIds.filter((pid) => !productIds.includes(pid))
            : [],
        })),
    }),
    {
      name: 'vape-shop-draft',
      storage: {
        getItem: (name) => {
          try {
            const str = localStorage.getItem(name);
            return str ? JSON.parse(str) : null;
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, JSON.stringify(value));
          } catch {
            console.warn('Draft could not be saved to localStorage (storage full?)');
          }
        },
        removeItem: (name) => {
          try {
            localStorage.removeItem(name);
          } catch {
            // ignore
          }
        },
      },
    },
  ),
);
