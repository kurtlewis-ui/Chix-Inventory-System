'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { api, getApiErrorMessage } from './api';
import { useToast } from '@/components/Toast';
import type { DraftItem, DraftDisposalItem, DraftExpense } from './draft';
import type {
  ActivityLog,
  AuthUser,
  Branch,
  BranchSummary,
  Brand,
  DashboardStats,
  Disposal,
  DisposalSummary,
  Expense,
  ExpenseSummary,
  FullUser,
  Pagination,
  PaymentMethod,
  PaymentSplit,
  Product,
  ProfitSummary,
  RoleOption,
  Sale,
  SalesOverviewPoint,
  SalesSummary,
  StaffDraft,
  TopProduct,
} from './types';

// How often the "live" pages (Pending Sales/Disposals/Expenses, Staff Drafts,
// branch summary) re-check the server. Set to 30s (was 10s) to cut database
// compute usage ~3x — a constantly-polling DB never gets to sleep, which burns
// through Neon's monthly compute allowance. 30s still feels near-real-time for
// approvals (and your OWN actions update instantly via mutation invalidation,
// independent of this timer). Polling also fully pauses when the tab is hidden
// or the device is offline (see below), so idle tabs cost nothing.
const LIVE_POLL_MS = 30_000;

// A slower cadence for SECONDARY live data on the Pending Sales page. That page
// mounts ~5 pollers at once; keeping them all at 30s is the biggest single
// compute drain. Only the main pending-sales list needs to feel snappy — the
// staff drafts, pending disposals, pending expenses, and the "today" branch
// summary change less often, so polling them every 60s (instead of 30s) roughly
// halves those four/five requests' DB load with no meaningful UX difference.
const SLOW_POLL_MS = 60_000;

// Returns false when the browser tab is hidden or the device is offline,
// pausing polling to save bandwidth, battery, and database compute.
function shouldPoll(): number | false {
  if (typeof document !== 'undefined' && document.hidden) return false;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  return LIVE_POLL_MS;
}

// Same hidden/offline gating as shouldPoll, but at the slower secondary cadence.
function shouldPollSlow(): number | false {
  if (typeof document !== 'undefined' && document.hidden) return false;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false;
  return SLOW_POLL_MS;
}

// Every backend response is wrapped as { success, data, pagination?, summary? }.
async function getData<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const res = await api.get(url, { params });
  return res.data.data as T;
}

interface ListResult<T> {
  data: T[];
  pagination?: Pagination;
  summary?: SalesSummary;
}

async function getList<T>(
  url: string,
  params?: Record<string, unknown>,
): Promise<ListResult<T>> {
  const res = await api.get(url, { params });
  return {
    data: (res.data.data ?? []) as T[],
    pagination: res.data.pagination,
    summary: res.data.summary,
  };
}

// Helper to invalidate several query-key prefixes after a mutation.
function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: QueryKey[]) =>
    keys.forEach((key) => qc.invalidateQueries({ queryKey: key }));
}

// ---------------------------------------------------------------------------
// Instant product-list cache updates.
//
// Product create/update/archive used to ONLY invalidate ['products'], which
// forces a full refetch of the (largest) products list before the screen
// reflects the change. On a slow/throttled server that refetch is ~1s, so
// saving/editing FELT slow even though the write itself was fast.
//
// These helpers patch every cached ['products', ...] list in place so the UI
// updates immediately, then trigger a BACKGROUND refetch (refetchType:'none'
// re-runs only on next use / mounted queries reconcile silently) so the cache
// still converges with the server without blocking what the user sees.
// ---------------------------------------------------------------------------
interface ProductListCache {
  data: Product[];
  pagination?: Pagination;
  summary?: SalesSummary;
}

function useProductCache() {
  const qc = useQueryClient();

  // Apply a transform to the data array of every cached products list.
  const patchLists = (fn: (list: Product[]) => Product[]) => {
    qc.setQueriesData<ProductListCache>({ queryKey: ['products'] }, (old) => {
      if (!old || !Array.isArray(old.data)) return old;
      return { ...old, data: fn(old.data) };
    });
  };

  return {
    // Replace an existing product (by id) across all cached lists.
    upsert: (product: Product | undefined | null) => {
      if (!product || !product.id) return;
      patchLists((list) => {
        const idx = list.findIndex((p) => p.id === product.id);
        if (idx === -1) return list; // not in this list (e.g. filtered out) — leave as-is
        const next = list.slice();
        next[idx] = { ...next[idx], ...product };
        return next;
      });
    },
    // Remove a product (by id) from all cached lists — for archive/delete.
    remove: (id: string) => {
      patchLists((list) => list.filter((p) => p.id !== id));
    },
    // Reconcile with the server WITHOUT blocking the UI: mounted lists refetch
    // quietly in the background; the instant patch above already updated them.
    reconcileInBackground: () => {
      qc.invalidateQueries({ queryKey: ['products'], refetchType: 'active' });
    },
  };
}

// Standardized toast callbacks for mutations. Pass a success message; failures
// automatically surface the API error text as an error toast. Pages that show
// their own inline error can still catch the thrown error as before — the
// toast is additive, not a replacement.
function useMutationToasts(successMessage: string) {
  const toast = useToast();
  return {
    onSuccess: () => toast.success(successMessage),
    onError: (err: unknown) => toast.error(getApiErrorMessage(err)),
  };
}

// ===========================================================================
// BRANCHES (Shops)
// ===========================================================================
export function useBranches() {
  return useQuery({
    queryKey: ['branches'],
    queryFn: () => getList<Branch>('/branches', { limit: 200 }),
  });
}

export function useArchivedBranches() {
  return useQuery({
    queryKey: ['branches', 'archived'],
    queryFn: () => getData<Branch[]>('/branches/archived'),
  });
}

export function useCreateBranch() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('Shop added');
  return useMutation({
    mutationFn: (body: { name: string; address?: string }) =>
      api.post('/branches', body).then((r) => r.data.data),
    onSuccess: () => { invalidate(['branches'], ['stats']); t.onSuccess(); },
    onError: t.onError,
  });
}

export function useUpdateBranch() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('Shop updated');
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; address?: string }) =>
      api.patch(`/branches/${id}`, body).then((r) => r.data.data),
    onSuccess: () => { invalidate(['branches']); t.onSuccess(); },
    onError: t.onError,
  });
}

export function useArchiveBranch() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('Shop archived');
  return useMutation({
    mutationFn: (id: string) => api.delete(`/branches/${id}`).then((r) => r.data.data),
    onSuccess: () => { invalidate(['branches'], ['stats']); t.onSuccess(); },
    onError: t.onError,
  });
}

export function useRestoreBranch() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('Shop restored');
  return useMutation({
    mutationFn: (id: string) =>
      api.post(`/branches/${id}/restore`).then((r) => r.data.data),
    onSuccess: () => { invalidate(['branches'], ['stats']); t.onSuccess(); },
    onError: t.onError,
  });
}

// ===========================================================================
// BRANDS
// ===========================================================================
export function useBrands(search?: string) {
  return useQuery({
    queryKey: ['brands', { search }],
    queryFn: () => getList<Brand>('/brands', { limit: 200, search: search || undefined }),
  });
}

export function useArchivedBrands() {
  return useQuery({
    queryKey: ['brands', 'archived'],
    queryFn: () => getList<Brand>('/brands/archived', { limit: 200 }),
  });
}

export function useCreateBrand() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('Brand added');
  return useMutation({
    mutationFn: (body: { name: string; coverImage?: string | null }) =>
      api.post('/brands', body).then((r) => r.data.data),
    onSuccess: () => { invalidate(['brands'], ['stats']); t.onSuccess(); },
    onError: t.onError,
  });
}

export function useUpdateBrand() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('Brand updated');
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; coverImage?: string | null }) =>
      api.patch(`/brands/${id}`, body).then((r) => r.data.data),
    onSuccess: () => { invalidate(['brands']); t.onSuccess(); },
    onError: t.onError,
  });
}

export function useArchiveBrand() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('Brand archived');
  return useMutation({
    mutationFn: (id: string) => api.delete(`/brands/${id}`).then((r) => r.data.data),
    onSuccess: () => { invalidate(['brands'], ['stats']); t.onSuccess(); },
    onError: t.onError,
  });
}

export function useRestoreBrand() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('Brand restored');
  return useMutation({
    mutationFn: (id: string) => api.post(`/brands/${id}/restore`).then((r) => r.data.data),
    onSuccess: () => { invalidate(['brands'], ['stats']); t.onSuccess(); },
    onError: t.onError,
  });
}

// ===========================================================================
// PRODUCTS
// ===========================================================================
export interface ProductMutationInput {
  name: string;
  brandId: string;
  sellingPrice: number;
  costPrice?: number;
  quantityAlert?: number;
  image?: string;
  quantities?: { branchId: string; quantity: number }[];
}

export function useProducts(params?: { search?: string; brandId?: string; branchId?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['products', params ?? {}],
    queryFn: () =>
      getList<Product>('/products', {
        limit: params?.limit ?? 20,
        page: params?.page ?? 1,
        search: params?.search || undefined,
        brandId: params?.brandId || undefined,
        branchId: params?.branchId || undefined,
      }),
  });
}

export function useArchivedProducts() {
  return useQuery({
    queryKey: ['products', 'archived'],
    queryFn: () => getList<Product>('/products/archived', { limit: 200 }),
  });
}

/**
 * Fetch a SINGLE product fresh from the server. Used to prefill the edit form —
 * especially the owner-only costPrice — so the modal always reflects the true
 * saved value instead of relying on possibly-stale/omitted list-cache data.
 * `enabled` lets the caller fetch only when a product is actually being edited.
 */
export function useProductDetail(id: string | null | undefined) {
  return useQuery({
    queryKey: ['product', id],
    enabled: !!id,
    queryFn: () => api.get(`/products/${id}`).then((r) => r.data.data as Product),
  });
}

export interface ImportProductRow {
  name: string;
  brand: string;
  sellingPrice: number;
  quantityAlert?: number;
  quantities?: { branchName: string; quantity: number }[];
}

export function useImportProducts() {
  const invalidate = useInvalidate();
  const toast = useToast();
  return useMutation({
    mutationFn: (products: ImportProductRow[]) =>
      api.post('/products/import', { products }).then((r) => r.data.data),
    onSuccess: (res: any) => {
      invalidate(['products'], ['brands'], ['stats']);
      const created = res?.created ?? 0;
      const updated = res?.updated ?? 0;
      toast.success(`Import complete — ${created} added, ${updated} updated`);
    },
    onError: (err) => toast.error(getApiErrorMessage(err)),
  });
}

export interface RestockItem {
  productId?: string;
  productName?: string;
  branchId?: string;
  branchName?: string;
  quantity: number;
}

export interface RestockResultData {
  updated: number;
  total: number;
  warnings: string[];
  // IDs of the stock movements this restock created — used to offer a one-tap
  // undo of exactly this batch.
  movementIds: string[];
}

// `silent` skips the built-in success toast so the caller can show its own
// (e.g. a success toast with an "Undo" action). Errors still toast.
export function useRestock(opts?: { silent?: boolean }) {
  const invalidate = useInvalidate();
  const t = useMutationToasts('Stock updated');
  return useMutation({
    mutationFn: (items: RestockItem[]) =>
      api.post('/products/restock', { items }).then((r) => r.data.data as RestockResultData),
    onSuccess: () => { invalidate(['products'], ['stats']); if (!opts?.silent) t.onSuccess(); },
    onError: t.onError,
  });
}

// Undo one or more stock movements (owner-only on the backend). Appends
// compensating movements — nothing is deleted. Returns { undone, skipped }.
export interface UndoStockResult {
  undone: number;
  skipped: { id: string; reason: string }[];
}
export function useUndoStock() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (movementIds: string[]) =>
      api.post('/products/stock-movements/undo', { movementIds }).then((r) => r.data.data as UndoStockResult),
    onSuccess: () => invalidate(['products'], ['stats'], ['stock-movements']),
  });
}

// Owner-only: reset ALL product stock to 0 at every branch. Requires the
// literal confirm string "RESET" (guards against accidental calls). Returns
// { cleared } — how many branch rows were zeroed. Logs an ADJUSTMENT movement
// per cleared row on the backend, so it stays in stock history.
export function useResetAllStock() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () =>
      api.post('/products/stock/reset', { confirm: 'RESET' }).then((r) => r.data.data as { cleared: number }),
    onSuccess: () => invalidate(['products'], ['stats'], ['stock-movements']),
  });
}

export function useCreateProduct() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('Product added');
  return useMutation({
    mutationFn: (body: ProductMutationInput) =>
      api.post('/products', body).then((r) => r.data.data),
    onSuccess: () => { invalidate(['products'], ['stats']); t.onSuccess(); },
    onError: t.onError,
  });
}

// `silent` skips the built-in success toast so the caller can show its own
// (e.g. with an "Undo" action for the quantity changes just made).
export function useUpdateProduct(opts?: { silent?: boolean }) {
  const invalidate = useInvalidate();
  const products = useProductCache();
  const t = useMutationToasts('Product updated');
  return useMutation({
    mutationFn: ({ id, ...body }: ProductMutationInput & { id: string }) =>
      api.patch(`/products/${id}`, body).then((r) => r.data.data as { undoMovementIds?: string[] } & Record<string, unknown>),
    onSuccess: (result) => {
      // Instantly reflect the saved product in every cached list (the server
      // returns the full updated product), so the screen updates without
      // waiting for a refetch. Then reconcile in the background.
      products.upsert(result as unknown as Product);
      products.reconcileInBackground();
      invalidate(['product'], ['stats']);
      if (!opts?.silent) t.onSuccess();
    },
    onError: t.onError,
  });
}

export function useArchiveProduct() {
  const invalidate = useInvalidate();
  const products = useProductCache();
  const t = useMutationToasts('Product archived');
  return useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`).then((r) => r.data.data),
    // Optimistically drop the row from all cached lists so it disappears
    // immediately, then reconcile with the server in the background.
    onMutate: (id: string) => { products.remove(id); },
    onSuccess: () => { products.reconcileInBackground(); invalidate(['stats']); t.onSuccess(); },
    onError: (err) => { products.reconcileInBackground(); t.onError(err); },
  });
}

// Persist a manual product order. `orderedIds` is the full list of product IDs
// in the desired top-to-bottom order.
export function useReorderProducts() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (orderedIds: string[]) =>
      api.patch('/products/reorder', { orderedIds }).then((r) => r.data.data),
    onSuccess: () => { invalidate(['products']); },
    onError: (err) => { throw err; },
  });
}

export function useRestoreProduct() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('Product restored');
  return useMutation({
    mutationFn: (id: string) =>
      api.post(`/products/${id}/restore`).then((r) => r.data.data),
    onSuccess: () => { invalidate(['products'], ['stats']); t.onSuccess(); },
    onError: t.onError,
  });
}

// ===========================================================================
// USERS
// ===========================================================================
export function useUsers(search?: string) {
  return useQuery({
    queryKey: ['users', { search }],
    queryFn: () => getList<FullUser>('/users', { limit: 100, search: search || undefined }),
  });
}

export function useArchivedUsers() {
  return useQuery({
    queryKey: ['users', 'archived'],
    queryFn: () => getList<FullUser>('/users/archived', { limit: 100 }),
  });
}

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: () => getData<RoleOption[]>('/users/roles'),
  });
}

export interface UserCreateInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  middleInitial?: string;
  roleId: string;
  branchId?: string;
  avatarUrl?: string;
}

export function useCreateUser() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('User created');
  return useMutation({
    mutationFn: (body: UserCreateInput) =>
      api.post('/users', body).then((r) => r.data.data),
    onSuccess: () => { invalidate(['users'], ['stats']); t.onSuccess(); },
    onError: t.onError,
  });
}

export interface UserUpdateInput {
  id: string;
  firstName?: string;
  lastName?: string;
  middleInitial?: string;
  email?: string;
  roleId?: string;
  branchId?: string | null;
  isActive?: boolean;
  avatarUrl?: string;
}

export function useUpdateUser() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('User updated');
  return useMutation({
    mutationFn: ({ id, ...body }: UserUpdateInput) =>
      api.patch(`/users/${id}`, body).then((r) => r.data.data),
    onSuccess: () => { invalidate(['users']); t.onSuccess(); },
    onError: t.onError,
  });
}

export function useResetUserPassword() {
  const t = useMutationToasts('Password reset');
  return useMutation({
    mutationFn: ({ id, newPassword, confirmPassword }: { id: string; newPassword: string; confirmPassword: string }) =>
      api.patch(`/users/${id}/password`, { newPassword, confirmPassword }).then((r) => r.data.data),
    onSuccess: t.onSuccess,
    onError: t.onError,
  });
}

export function useArchiveUser() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('User archived');
  return useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`).then((r) => r.data),
    onSuccess: () => { invalidate(['users'], ['stats']); t.onSuccess(); },
    onError: t.onError,
  });
}

export function useRestoreUser() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('User restored');
  return useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/restore`).then((r) => r.data.data),
    onSuccess: () => { invalidate(['users'], ['stats']); t.onSuccess(); },
    onError: t.onError,
  });
}

// ===========================================================================
// SALES
// ===========================================================================
export interface SaleItemInput {
  productId: string;
  quantity: number;
  discount?: number;
  paymentMethod: PaymentMethod;
  bankNote?: string;
  note?: string;
  paymentSplit?: PaymentSplit;
}

export interface SaleCreateInput {
  branchId?: string;
  customerName?: string;
  items: SaleItemInput[];
}

export function useSalesRecords(params?: {
  search?: string;
  branchId?: string;
  startDate?: string;
  endDate?: string;
}) {
  return useQuery({
    queryKey: ['sales', 'records', params ?? {}],
    queryFn: () =>
      getList<Sale>('/sales/records', {
        limit: 200,
        search: params?.search || undefined,
        branchId: params?.branchId || undefined,
        startDate: params?.startDate || undefined,
        endDate: params?.endDate || undefined,
      }),
  });
}

export function useSalesPending(params?: {
  search?: string;
  branchId?: string;
  startDate?: string;
  endDate?: string;
}) {
  return useQuery({
    queryKey: ['sales', 'pending', params ?? {}],
    queryFn: () =>
      getList<Sale>('/sales/pending', {
        limit: 200,
        search: params?.search || undefined,
        branchId: params?.branchId || undefined,
        startDate: params?.startDate || undefined,
        endDate: params?.endDate || undefined,
      }),
    refetchInterval: shouldPoll,
  });
}

export function useCreateSale() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('Sale recorded');
  return useMutation({
    mutationFn: (body: SaleCreateInput) => api.post('/sales', body).then((r) => r.data.data),
    // Creating a sale reserves (decrements) stock — refresh products.
    onSuccess: () => { invalidate(['sales'], ['products'], ['stats']); t.onSuccess(); },
    onError: t.onError,
  });
}

export function useUpdateSale() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('Sale updated');
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<SaleCreateInput>) =>
      api.patch(`/sales/${id}`, body).then((r) => r.data.data),
    onSuccess: () => { invalidate(['sales']); t.onSuccess(); },
    onError: t.onError,
  });
}

export function useApproveSale() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('Sale approved');
  return useMutation({
    mutationFn: (id: string) => api.post(`/sales/${id}/approve`).then((r) => r.data.data),
    onSuccess: () => { invalidate(['sales'], ['products'], ['stats']); t.onSuccess(); },
    onError: t.onError,
  });
}

export function useDeclineSale() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('Sale declined');
  return useMutation({
    mutationFn: (id: string) => api.post(`/sales/${id}/decline`).then((r) => r.data.data),
    // Declining a pending sale restores (increments) stock — refresh products.
    onSuccess: () => { invalidate(['sales'], ['products'], ['stats']); t.onSuccess(); },
    onError: t.onError,
  });
}

export function useDeleteSale() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('Sale deleted');
  return useMutation({
    mutationFn: (id: string) => api.delete(`/sales/${id}`).then((r) => r.data.data),
    // Deleting a pending sale restores (increments) stock — refresh products.
    onSuccess: () => { invalidate(['sales'], ['products'], ['stats']); t.onSuccess(); },
    onError: t.onError,
  });
}

// ===========================================================================
// STAFF DRAFT CARTS
// ===========================================================================

// Staff: push their current draft cart to the server so an Admin can see it.
export interface DraftSyncInput {
  items: {
    productId: string;
    name: string;
    brandName: string;
    unitPrice: number;
    quantity: number;
    image?: string | null;
    discount?: number;
    paymentMethod: PaymentMethod;
    bankNote?: string | null;
    note?: string | null;
    paymentSplit?: PaymentSplit | null;
    addedAt?: string;
  }[];
  disposalItems?: {
    productId: string;
    name: string;
    brandName: string;
    quantity: number;
    image?: string | null;
    reason?: string | null;
    addedAt?: string;
  }[];
  expenses?: { amount: number; note: string; addedAt?: string }[];
  customerName?: string;
}

export function useSaveDraft() {
  return useMutation({
    mutationFn: (body: DraftSyncInput) => api.put('/sales/draft', body).then((r) => r.data.data),
  });
}

export function useClearDraftSync() {
  return useMutation({
    mutationFn: () => api.delete('/sales/draft').then((r) => r.data.data),
  });
}

// Staff: submit their own draft (sale + staged disposals + staged expenses)
// in one call. The server creates each part independently and reports back
// which (if any) failed, e.g. if stock ran out between staging and submit.
export interface SaveDraftResult {
  sale: unknown;
  disposals: unknown[];
  expenses: unknown[];
  errors: string[];
}

export function useSaveMyDraft() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => api.post('/sales/draft/save').then((r) => r.data.data as SaveDraftResult),
    // ['products'] refreshes the staff Products page so stock visibly drops
    // once the order (and any staged disposals) are submitted.
    onSuccess: () => invalidate(['sales'], ['disposals'], ['expenses'], ['products'], ['stats']),
  });
}

// Staff: poll whether a draft still exists server-side for them. Used to
// detect an admin submitting their draft on their behalf (via the admin's
// "Save Draft" button) so the local cart can be cleared to match — otherwise
// the staff's device would still show the already-submitted items and could
// resubmit them as duplicates.
export interface MyDraftContent {
  exists: boolean;
  items: DraftItem[];
  disposalItems: DraftDisposalItem[];
  expenses: DraftExpense[];
}

export function useMyDraftExists() {
  return useQuery({
    queryKey: ['my-draft-exists'],
    queryFn: () => getData<MyDraftContent>('/sales/draft'),
    refetchInterval: shouldPollSlow,
  });
}

// Admin: poll every staff member's current draft cart, optionally scoped to
// a branch. Short interval so it feels close to live on the Pending Sales page.
export function useStaffDrafts(branchId?: string) {
  return useQuery({
    queryKey: ['staff-drafts', { branchId }],
    queryFn: () => getData<StaffDraft[]>('/sales/drafts', { branchId: branchId || undefined }),
    refetchInterval: shouldPollSlow,
  });
}

// Admin: submit a staff member's draft on their behalf (they forgot to hit
// Save Order). Creates the real PENDING sale/disposal(s)/expense(s).
export function useSaveDraftForStaff() {
  const invalidate = useInvalidate();
  const t = useMutationToasts("Staff order submitted");
  return useMutation({
    mutationFn: (staffId: string) =>
      api.post(`/sales/drafts/${staffId}/save`).then((r) => r.data.data),
    // Submitting a staff draft reserves (decrements) stock — refresh products.
    onSuccess: () => {
      invalidate(['staff-drafts'], ['sales'], ['disposals'], ['expenses'], ['products'], ['stats']);
      t.onSuccess();
    },
    onError: t.onError,
  });
}

// Admin: DISCARD a single staff member's draft without submitting it. Nothing
// is sold/disposed/expensed — the staged cart is simply thrown away. Only the
// draft list needs refreshing (no stock or records change).
export function useClearStaffDraft() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('Draft cleared');
  return useMutation({
    mutationFn: (staffId: string) =>
      api.delete(`/sales/drafts/${staffId}`).then((r) => r.data.data),
    onSuccess: () => {
      invalidate(['staff-drafts']);
      t.onSuccess();
    },
    onError: t.onError,
  });
}

// Admin: DISCARD every staff draft (optionally scoped to a branch) without
// submitting any of them.
export function useClearAllDrafts() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('All drafts cleared');
  return useMutation({
    mutationFn: (branchId?: string) =>
      api.delete('/sales/drafts', { params: { branchId: branchId || undefined } }).then((r) => r.data.data),
    onSuccess: () => {
      invalidate(['staff-drafts']);
      t.onSuccess();
    },
    onError: t.onError,
  });
}

// ===========================================================================
// STATS + ACTIVITY LOGS
// ===========================================================================
export function useDashboardStats() {
  return useQuery({
    queryKey: ['stats', 'dashboard'],
    queryFn: () => getData<DashboardStats>('/stats/dashboard'),
  });
}

export function useActivityLogs(params?: { search?: string; category?: string; startDate?: string; endDate?: string }) {
  return useQuery({
    queryKey: ['activity-logs', params ?? {}],
    queryFn: () =>
      getList<ActivityLog>('/activity-logs', {
        limit: 100,
        search: params?.search || undefined,
        category: params?.category && params.category !== 'All' ? params.category : undefined,
        startDate: params?.startDate || undefined,
        endDate: params?.endDate || undefined,
      }),
  });
}

export function useSalesOverview(period: string, branchId?: string) {
  return useQuery({
    queryKey: ['stats', 'sales-overview', { period, branchId }],
    queryFn: () => getData<SalesOverviewPoint[]>('/stats/sales-overview', { period, branchId: branchId || undefined }),
  });
}

export function useTopProducts(branchId?: string) {
  return useQuery({
    queryKey: ['stats', 'top-products', { branchId }],
    queryFn: () => getData<TopProduct[]>('/stats/top-products', { branchId: branchId || undefined }),
  });
}

// Owner-only Profit & Loss. Computed on the server so it can use the
// confidential per-item cost price (never sent to the browser) and covers ALL
// matching approved sales, not just one page. branchId '' / undefined = all shops.
export function useProfitSummary(params?: { branchId?: string; startDate?: string; endDate?: string }) {
  const branchId = params?.branchId;
  const startDate = params?.startDate;
  const endDate = params?.endDate;
  return useQuery({
    queryKey: ['stats', 'profit-summary', { branchId, startDate, endDate }],
    queryFn: () =>
      getData<ProfitSummary>('/stats/profit-summary', {
        branchId: branchId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
  });
}

// ===========================================================================
// DISPOSALS
// ===========================================================================
export function useDisposals(params?: { search?: string; branchId?: string; startDate?: string; endDate?: string; status?: string }) {
  return useQuery({
    queryKey: ['disposals', params ?? {}],
    queryFn: async () => {
      const res = await api.get('/disposals', {
        params: {
          limit: 200,
          search: params?.search || undefined,
          branchId: params?.branchId || undefined,
          startDate: params?.startDate || undefined,
          endDate: params?.endDate || undefined,
          status: params?.status || undefined,
        },
      });
      return {
        data: (res.data.data ?? []) as Disposal[],
        summary: (res.data.summary ?? { totalValue: 0, totalQuantity: 0, count: 0 }) as DisposalSummary,
      };
    },
  });
}

export function useCreateDisposal() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('Disposal requested');
  return useMutation({
    mutationFn: (body: { branchId?: string; productId: string; quantity: number; reason?: string }) =>
      api.post('/disposals', body).then((r) => r.data.data),
    onSuccess: () => { invalidate(['disposals'], ['products'], ['stats']); t.onSuccess(); },
    onError: t.onError,
  });
}

export function useDisposalsPending(params?: { search?: string; branchId?: string }) {
  return useQuery({
    queryKey: ['disposals', 'pending', params ?? {}],
    queryFn: async () => {
      const res = await api.get('/disposals/pending', {
        params: {
          limit: 200,
          search: params?.search || undefined,
          branchId: params?.branchId || undefined,
        },
      });
      return {
        data: (res.data.data ?? []) as Disposal[],
        summary: (res.data.summary ?? { totalValue: 0, totalQuantity: 0, count: 0 }) as DisposalSummary,
      };
    },
    refetchInterval: shouldPollSlow,
  });
}

export function useApproveDisposal() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('Disposal approved');
  return useMutation({
    mutationFn: (id: string) => api.post(`/disposals/${id}/approve`).then((r) => r.data.data),
    onSuccess: () => { invalidate(['disposals'], ['products'], ['stats']); t.onSuccess(); },
    onError: t.onError,
  });
}

export function useDeclineDisposal() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('Disposal declined');
  return useMutation({
    mutationFn: (id: string) => api.post(`/disposals/${id}/decline`).then((r) => r.data.data),
    // Declining a pending disposal restores (increments) stock — refresh products.
    onSuccess: () => { invalidate(['disposals'], ['products'], ['stats']); t.onSuccess(); },
    onError: t.onError,
  });
}

// ===========================================================================
// EXPENSES
// ===========================================================================
export function useCreateExpense() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('Expense added');
  return useMutation({
    mutationFn: (body: { branchId?: string; amount: number; note: string }) =>
      api.post('/expenses', body).then((r) => r.data.data),
    onSuccess: () => { invalidate(['expenses'], ['stats']); t.onSuccess(); },
    onError: t.onError,
  });
}

export function useExpenses(params?: {
  search?: string;
  branchId?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: ['expenses', params ?? {}],
    queryFn: async () => {
      const res = await api.get('/expenses', {
        params: {
          limit: 200,
          search: params?.search || undefined,
          branchId: params?.branchId || undefined,
          startDate: params?.startDate || undefined,
          endDate: params?.endDate || undefined,
          status: params?.status || undefined,
        },
      });
      return {
        data: (res.data.data ?? []) as Expense[],
        summary: (res.data.summary ?? { totalAmount: 0, count: 0 }) as ExpenseSummary,
      };
    },
  });
}

export function useExpensesPending(params?: { search?: string; branchId?: string }) {
  return useQuery({
    queryKey: ['expenses', 'pending', params ?? {}],
    queryFn: async () => {
      const res = await api.get('/expenses/pending', {
        params: {
          limit: 200,
          search: params?.search || undefined,
          branchId: params?.branchId || undefined,
        },
      });
      return {
        data: (res.data.data ?? []) as Expense[],
        summary: (res.data.summary ?? { totalAmount: 0, count: 0 }) as ExpenseSummary,
      };
    },
    refetchInterval: shouldPollSlow,
  });
}

export function useApproveExpense() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('Expense approved');
  return useMutation({
    mutationFn: (id: string) => api.post(`/expenses/${id}/approve`).then((r) => r.data.data),
    onSuccess: () => { invalidate(['expenses'], ['stats']); t.onSuccess(); },
    onError: t.onError,
  });
}

export function useDeclineExpense() {
  const invalidate = useInvalidate();
  const t = useMutationToasts('Expense declined');
  return useMutation({
    mutationFn: (id: string) => api.post(`/expenses/${id}/decline`).then((r) => r.data.data),
    onSuccess: () => { invalidate(['expenses']); t.onSuccess(); },
    onError: t.onError,
  });
}

// Today's approved Total Sales / Total Expenses / Net for a branch. Used on
// both the admin Pending Sales page and the staff Daily Report page.
export function useBranchSummary(branchId?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['stats', 'branch-summary', { branchId }],
    queryFn: () => getData<BranchSummary>('/stats/branch-summary', { branchId: branchId || undefined }),
    refetchInterval: shouldPollSlow,
    // Admin/Owner must pass a specific branch — skip the query entirely
    // when none is selected (e.g. "All Shops" on the Sales Records page)
    // instead of firing a request that's guaranteed to 400.
    enabled: options?.enabled ?? true,
  });
}

// ===========================================================================
// PROFILE (self)
// ===========================================================================
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => getData<AuthUser>('/auth/me'),
    // Poll so a server-side profile change (e.g. an owner/admin reassigning
    // this staff to a different branch) is picked up without waiting for the
    // next login or token refresh. 90s is plenty for a rare profile
    // reassignment and further cuts database compute; a tab refocus still
    // refetches instantly (refetchOnWindowFocus), so changes are picked up
    // the moment the staff returns to the tab. Pauses when the tab is hidden.
    refetchInterval: () => (shouldPoll() === false ? false : 90_000),
    refetchOnWindowFocus: true,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      firstName?: string;
      lastName?: string;
      middleInitial?: string;
      email?: string;
      avatarUrl?: string;
    }) => api.patch('/auth/profile', body).then((r) => r.data.data as AuthUser),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useChangeOwnPassword() {
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string; confirmPassword: string }) =>
      api.post('/auth/change-password', body).then((r) => r.data.data),
  });
}


// ===========================================================================
// STOCK MOVEMENTS (product history per branch)
// ===========================================================================
export function useStockMovements(params?: { productId?: string; branchId?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: ['stock-movements', params ?? {}],
    queryFn: async () => {
      const res = await api.get('/stock-movements', {
        params: {
          productId: params?.productId || undefined,
          branchId: params?.branchId || undefined,
          page: params?.page ?? 1,
          limit: params?.limit ?? 50,
        },
      });
      // The backend wraps via TransformInterceptor: { success, data: { data: [...], pagination } }
      const body = res.data?.data ?? res.data;
      const movements = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
      const pagination = body?.pagination ?? res.data?.pagination;
      return {
        data: movements as import('./types').StockMovement[],
        pagination: pagination as import('./types').Pagination | undefined,
      };
    },
    enabled: !!params?.productId,
  });
}
