'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Archive, X, Loader2, Upload, Download, RefreshCw, FileDown, ClipboardList, Trash2, GripVertical, ArrowUpDown, Check, AlertTriangle } from 'lucide-react';
import {
  useProducts,
  useBrands,
  useBranches,
  useCreateProduct,
  useUpdateProduct,
  useArchiveProduct,
  useImportProducts,
  useRestock,
  useUndoStock,
  useResetAllStock,
  useReorderProducts,
  useProductDetail,
  type ImportProductRow,
  type RestockItem,
} from '@/lib/hooks';
import { useDragReorder } from '@/lib/useDragReorder';
import { useToast } from '@/components/Toast';
import { getApiErrorMessage } from '@/lib/api';
import { parseCsv, readFileAsText } from '@/lib/csv';
// xlsx-js-style is heavy and only needed for export/import/template actions, so
// it's dynamically imported inside those handlers (keeps it out of the Products
// page's initial bundle). Only the type is imported statically (erased at build).
import type { ProductRow } from '@/lib/xlsx-utils';
import { useAuthStore } from '@/lib/store';
import { ImageCropModal } from '@/components/ImageCropModal';
import type { Product, ImportResult, RestockResult } from '@/lib/types';
import { StockHistoryModal } from '@/components/StockHistoryModal';
import { Select } from '@/components/Select';
import { NumberStepper } from '@/components/NumberStepper';
import { useUnsavedGuard, withScrollPreserved } from '@/lib/useUnsavedGuard';
import { useStoredBranch } from '@/lib/useStoredBranch';

const ENTRIES_OPTIONS = [5, 10, 25, 50, 100, 'All'] as const;

export default function ProductsPage() {
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [entriesPerPage, setEntriesPerPage] = useState<number | 'All'>(10);
  const [currentPage, setCurrentPage] = useState(1);

  const { data: branchData } = useBranches();
  const { data: brandData } = useBrands();
  const branches = branchData?.data ?? [];
  const brands = brandData?.data ?? [];
  // Shared+persisted branch filter ('' = All Shops), remembered across the site.
  const [shopFilter, setShopFilter] = useStoredBranch(branches);
  const isAdmin = useAuthStore((s) => {
    const role = s.user?.role?.name;
    return role === 'Admin' || role === 'Owner';
  });
  const isOwner = useAuthStore((s) => s.user?.role?.name === 'Owner');

  // Fetch the max the backend allows (200) so ALL products are available for
  // the client-side pagination/slicing below. Without this the query defaulted
  // to 20, so the "Show 50/100/All" control and paging past 20 showed nothing
  // beyond the first 20 rows.
  const { data, isLoading, isError, error } = useProducts({ search, brandId: brandFilter || undefined, limit: 200 });
  const products = data?.data ?? [];

  const createProduct = useCreateProduct();
  // silent: the page shows its own success toast (with an Undo action for owners).
  const updateProduct = useUpdateProduct({ silent: true });
  const archiveProduct = useArchiveProduct();
  const reorderProducts = useReorderProducts();
  const undoStock = useUndoStock();
  const resetAllStock = useResetAllStock();
  const toast = useToast();

  // Owner-only "reset all stock to 0" — guarded by a type-to-confirm modal.
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');

  async function handleResetAllStock() {
    // Extra safety: only proceed when the owner has typed the exact word.
    if (resetConfirmText.trim().toUpperCase() !== 'RESET') return;
    try {
      const res = await resetAllStock.mutateAsync();
      setShowResetModal(false);
      setResetConfirmText('');
      toast.success(`Cleared stock on ${res.cleared} shop ${res.cleared === 1 ? 'entry' : 'entries'}.`, 'All stock reset to 0');
    } catch (e) {
      toast.error(getApiErrorMessage(e));
    }
  }

  // Show a success toast for an owner that can undo the stock movements just
  // created. Falls back to a plain success toast for non-owners or when there
  // was nothing quantity-related to undo.
  function toastWithUndo(message: string, movementIds: string[]) {
    if (isOwner && movementIds.length > 0) {
      toast.show('success', message, {
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              const res = await undoStock.mutateAsync(movementIds);
              if (res.undone > 0) toast.success('Reverted.', 'Undone');
              else toast.error(res.skipped[0]?.reason ?? 'Nothing to undo.');
            } catch (e) {
              toast.error(getApiErrorMessage(e));
            }
          },
        },
      });
    } else {
      toast.success(message);
    }
  }

  // Manual reorder mode. Dragging only makes sense when the visible list is the
  // full, true order — i.e. no search, no brand filter, and "All" entries shown
  // on the first page — otherwise dragging a filtered/paged subset would corrupt
  // the global order. Only admins/owners (who can already edit) may reorder.
  const [reorderMode, setReorderMode] = useState(false);
  const canReorder = isAdmin && !search && !brandFilter && entriesPerPage === 'All';

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [archivingProduct, setArchivingProduct] = useState<Product | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);

  const [formName, setFormName] = useState('');
  const [formBrand, setFormBrand] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formCostPrice, setFormCostPrice] = useState('');
  const [formAlert, setFormAlert] = useState('0');
  const [formImage, setFormImage] = useState<string | null>(null);
  const [formQuantities, setFormQuantities] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  // Tracks whether the open Add/Edit form has unsaved edits, to guard close.
  const [formDirty, setFormDirty] = useState(false);

  // When editing, fetch the product FRESH so the owner-only Cost Price is always
  // accurate (the list cache may be stale or omit cost). When it arrives, fill
  // the cost box only if the owner hasn't already typed something in this open.
  const { data: freshEditProduct } = useProductDetail(showEditModal ? editingProduct?.id : null);
  useEffect(() => {
    if (!showEditModal || !freshEditProduct) return;
    if (!formDirty && freshEditProduct.costPrice != null) {
      setFormCostPrice(freshEditProduct.costPrice.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshEditProduct, showEditModal]);

  const closeAdd = useUnsavedGuard(formDirty, () => { setShowAddModal(false); setFormDirty(false); });
  const closeEdit = useUnsavedGuard(formDirty, () => { setShowEditModal(false); setEditingProduct(null); setFormDirty(false); });

  const totalPages = entriesPerPage === 'All' ? 1 : Math.max(1, Math.ceil(products.length / entriesPerPage));
  const displayProducts = entriesPerPage === 'All' ? products : products.slice((currentPage - 1) * entriesPerPage, currentPage * entriesPerPage);
  const branchesForForm = useMemo(() => branches, [branches]);
  // When a specific shop is selected, only show that shop's quantity in the form
  const branchesForEdit = useMemo(() => {
    if (shopFilter) return branches.filter((b) => b.id === shopFilter);
    return branches;
  }, [branches, shopFilter]);

  // Drag-to-reorder over the full product list. `items` mirrors `products`
  // and is what we render while in reorder mode; on drop it persists the new
  // order to the backend (optimistic — the list re-syncs on the refetch).
  const { items: orderedProducts, dragIndex, overIndex, startDrag, syncFromSource } = useDragReorder(products, {
    getId: (p: Product) => p.id,
    onCommit: (orderedIds) => {
      reorderProducts.mutate(orderedIds, {
        onError: (e) => toast.error(getApiErrorMessage(e), "Couldn't save order"),
      });
    },
  });
  // Keep the drag copy in step with fresh server data when not dragging.
  useEffect(() => { syncFromSource(); }, [products, syncFromSource]);
  // Leaving a state where reordering is allowed turns the mode off.
  useEffect(() => { if (!canReorder) setReorderMode(false); }, [canReorder]);

  // The list actually rendered: the drag copy while reordering, else the paged
  // slice. Filtered to defined items so a transient hole can never crash render.
  const rowProducts = (reorderMode ? orderedProducts : displayProducts).filter(Boolean) as Product[];

  function qtyForBranch(product: Product, branchId: string) {
    return product.quantities.find((q) => q.branchId === branchId)?.quantity ?? 0;
  }

  function openAddModal() {
    // Start numeric fields EMPTY so they show a gray "0" placeholder instead of
    // a literal 0 the user must delete before typing. Submit defaults to 0.
    setFormName(''); setFormBrand(brands[0]?.id ?? ''); setFormPrice(''); setFormCostPrice(''); setFormAlert('');
    setFormImage(null);
    const q: Record<string, string> = {}; branchesForForm.forEach((b) => (q[b.id] = ''));
    setFormQuantities(q); setFormError(null); setFormDirty(false); setShowAddModal(true);
  }
  function openEditModal(product: Product) {
    setEditingProduct(product);
    setFormName(product.name); setFormBrand(product.brand?.id ?? brands[0]?.id ?? '');
    // When a specific shop is selected, prefill THAT branch's own price so
    // saving doesn't overwrite the branch price with the global default.
    // (buildQuantitiesPayload sends formPrice as the branch price in this case.)
    const priceToShow = shopFilter
      ? (product.quantities.find((q) => q.branchId === shopFilter)?.sellingPrice ?? product.sellingPrice)
      : product.sellingPrice;
    // Prefill the owner-only cost from the product so it shows back after saving
    // and edits don't wipe it. (Non-owners never receive costPrice, so this is empty for them.)
    setFormPrice(priceToShow.toString()); setFormCostPrice(product.costPrice != null ? product.costPrice.toString() : ''); setFormAlert(product.quantityAlert.toString());
    setFormImage(product.image ?? null);
    const q: Record<string, string> = {};
    branchesForEdit.forEach((b) => { q[b.id] = (product.quantities.find((x) => x.branchId === b.id)?.quantity ?? 0).toString(); });
    setFormQuantities(q); setFormError(null); setFormDirty(false); setShowEditModal(true);
  }
  function buildQuantitiesPayload() {
    // Only send quantities for branches shown in the form
    const targetBranches = showEditModal ? branchesForEdit : branchesForForm;
    return targetBranches.map((b) => ({
      branchId: b.id,
      quantity: parseInt(formQuantities[b.id] || '0') || 0,
      // When editing a specific branch, include the selling price as a branch override
      ...(shopFilter && showEditModal ? { sellingPrice: parseFloat(formPrice) || 0 } : {}),
    }));
  }
  async function handleAdd() {
    if (!formName.trim()) { setFormError('Product name is required.'); return; }
    if (!formBrand) { setFormError('Please select a brand.'); return; }
    setFormError(null);
    try {
      await createProduct.mutateAsync({ name: formName.trim(), brandId: formBrand, sellingPrice: parseFloat(formPrice) || 0, costPrice: parseFloat(formCostPrice) || 0, quantityAlert: parseInt(formAlert) || 0, image: formImage ?? undefined, quantities: buildQuantitiesPayload() });
      setFormDirty(false); setShowAddModal(false);
    } catch (e) { setFormError(getApiErrorMessage(e)); }
  }
  async function handleEdit() {
    if (!editingProduct || !formName.trim()) { setFormError('Product name is required.'); return; }
    if (!formBrand) { setFormError('Please select a brand.'); return; }
    setFormError(null);
    try {
      // When a specific branch is selected, price goes to the branch (not global)
      const updateData: any = { id: editingProduct.id, name: formName.trim(), brandId: formBrand, quantityAlert: parseInt(formAlert) || 0, image: formImage ?? '', quantities: buildQuantitiesPayload() };
      // Only send costPrice when the owner actually entered a value. Sending it
      // unconditionally would zero the stored cost on every non-owner edit (they
      // never see the field) and on owner edits that leave it blank.
      if (formCostPrice.trim() !== '') {
        updateData.costPrice = parseFloat(formCostPrice) || 0;
      }
      if (!shopFilter) {
        // All Shops → update the global/default selling price
        updateData.sellingPrice = parseFloat(formPrice) || 0;
      }
      const res = await withScrollPreserved(() => updateProduct.mutateAsync(updateData));
      setFormDirty(false); setEditingProduct(null); setShowEditModal(false);
      const ids = Array.isArray((res as any)?.undoMovementIds) ? (res as any).undoMovementIds as string[] : [];
      toastWithUndo('Product updated', ids);
    } catch (e) { setFormError(getApiErrorMessage(e)); }
  }
  async function handleArchive() {
    if (!archivingProduct) return;
    try { await archiveProduct.mutateAsync(archivingProduct.id); setArchivingProduct(null); setShowArchiveModal(false); }
    catch (e) { setFormError(getApiErrorMessage(e)); }
  }

  async function handleExport() {
    const targetShops = shopFilter ? branches.filter((b) => b.id === shopFilter) : branches;
    const xlsxProducts: ProductRow[] = products.map((p, idx) => ({
      productId: idx + 1,
      productName: p.name,
      brand: p.brand?.name ?? '',
      sellingPrice: p.sellingPrice,
      quantities: Object.fromEntries(targetShops.map((b) => [b.name, qtyForBranch(p, b.id)])),
    }));
    const { generateRestockXlsx } = await import('@/lib/xlsx-utils');
    generateRestockXlsx(xlsxProducts, targetShops, {
      filename: `products-export-${new Date().toISOString().slice(0, 10)}.xlsx`,
    });
  }
  async function handleTemplate() {
    const targetShops = shopFilter ? branches.filter((b) => b.id === shopFilter) : branches;
    const xlsxProducts: ProductRow[] = products.map((p, idx) => ({
      productId: idx + 1,
      productName: p.name,
      brand: p.brand?.name ?? '',
      sellingPrice: p.sellingPrice,
      quantities: {},
    }));
    const { generateRestockXlsx } = await import('@/lib/xlsx-utils');
    generateRestockXlsx(xlsxProducts, targetShops, {
      filename: `restock-template-${new Date().toISOString().slice(0, 10)}.xlsx`,
      isTemplate: true,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold text-text-primary">Products</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowImportModal(true)} className="flex items-center gap-1 bg-btn-primary text-btn-primary-text px-3 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition"><Upload size={14} /> Import</button>
          <button onClick={handleExport} className="flex items-center gap-1 bg-btn-primary text-btn-primary-text px-3 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition"><Download size={14} /> Export</button>
          <button onClick={openAddModal} className="flex items-center gap-1 btn-grad px-3 py-2 rounded-lg text-sm font-medium"><Plus size={14} /> Add Product</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={shopFilter} onChange={setShopFilter} ariaLabel="Shop filter" className="min-w-[180px] w-auto" options={[{ value: '', label: 'All Shops' }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} />
        <button onClick={() => setShowRestockModal(true)} className="flex items-center gap-1 bg-btn-primary text-btn-primary-text px-3 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition"><RefreshCw size={14} /> Restock</button>
        <button onClick={handleTemplate} className="flex items-center gap-1 btn-secondary text-text-primary px-3 py-2 rounded-lg text-sm font-medium"><FileDown size={14} /> Restock Template</button>
        {isAdmin && (
          <button
            onClick={() => setReorderMode((v) => !v)}
            disabled={!canReorder && !reorderMode}
            title={canReorder ? 'Drag products to reorder them' : 'To reorder: clear search/brand filters and set entries to “All”'}
            className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${reorderMode ? 'bg-accent-green text-white hover:opacity-90' : 'btn-secondary text-text-primary'}`}
          >
            {reorderMode ? <><Check size={14} /> Done Reordering</> : <><ArrowUpDown size={14} /> Reorder</>}
          </button>
        )}
        {isOwner && (
          <button
            onClick={() => { setResetConfirmText(''); setShowResetModal(true); }}
            title="Reset all product stock to 0 at every shop"
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium border border-accent-red/40 text-accent-red hover:bg-accent-red/10 transition"
          >
            <AlertTriangle size={14} /> Reset Stock
          </button>
        )}
      </div>
      {reorderMode && (
        <div className="rounded-lg border border-accent-green/30 bg-accent-green/10 px-4 py-2 text-sm text-text-secondary">
          Drag the <GripVertical size={14} className="inline align-text-bottom" /> handle on a product to move it up or down. Changes save automatically.
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <span>Show</span>
          <Select value={entriesPerPage.toString()} onChange={(v) => { setEntriesPerPage(v === 'All' ? 'All' : parseInt(v)); setCurrentPage(1); }} ariaLabel="Entries per page" className="w-auto min-w-[80px]" options={ENTRIES_OPTIONS.map((o) => ({ value: o.toString(), label: o.toString() }))} />
          <span>entries</span>
        </div>
        <input type="text" placeholder="Search products..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} className="border border-input-border rounded px-3 py-1.5 text-sm text-text-primary bg-input-bg focus:outline-none focus:border-input-focus w-48" />
      </div>

      <div className="bg-card-bg border border-card-border rounded-lg overflow-x-auto">
        {/* Desktop: table (hidden on mobile) */}
        <table className="hidden w-full md:table">
          <thead>
            <tr className="bg-table-header">
              {reorderMode && <th className="w-8 px-2 py-3" aria-label="Drag handle" />}
              <th className="text-left px-3 py-3 text-xs font-semibold uppercase text-table-header-text w-10">#</th>
              <th className="text-left px-3 py-3 text-xs font-semibold uppercase text-table-header-text w-16">Image</th>
              <th className="text-left px-3 py-3 text-xs font-semibold uppercase text-table-header-text">Name</th>
              <th className="text-left px-3 py-3 text-xs font-semibold uppercase text-table-header-text">Quantity</th>
              <th className="text-left px-3 py-3 text-xs font-semibold uppercase text-table-header-text">Brand</th>
              <th className="text-left px-3 py-3 text-xs font-semibold uppercase text-table-header-text">Selling Price</th>
              <th className="text-left px-3 py-3 text-xs font-semibold uppercase text-table-header-text">Qty Alert</th>
              <th className="text-right px-3 py-3 text-xs font-semibold uppercase text-table-header-text w-20"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={reorderMode ? 9 : 8} className="text-center py-8 text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading products...</td></tr>
            ) : isError ? (
              <tr><td colSpan={reorderMode ? 9 : 8} className="text-center py-8 text-accent-red">{getApiErrorMessage(error)}</td></tr>
            ) : rowProducts.length === 0 ? (
              <tr><td colSpan={reorderMode ? 9 : 8} className="text-center py-8 text-text-muted">No products found. Add one or import a CSV.</td></tr>
            ) : (
              rowProducts.map((product, i) => (
                <tr
                  key={product.id}
                  data-reorder-row={reorderMode ? '' : undefined}
                  data-reorder-id={reorderMode ? product.id : undefined}
                  className={`border-t border-card-border align-top transition-colors ${reorderMode && dragIndex === i ? 'opacity-50' : ''} ${reorderMode && overIndex === i && dragIndex !== i ? 'bg-accent-green/10' : ''}`}
                >
                  {reorderMode && (
                    <td className="px-2 py-3 align-middle">
                      <button
                        type="button"
                        onPointerDown={(e) => startDrag(i, e)}
                        className="flex h-8 w-6 cursor-grab touch-none items-center justify-center rounded text-text-muted hover:text-text-primary active:cursor-grabbing"
                        title="Drag to reorder"
                        aria-label={`Drag ${product.name} to reorder`}
                      >
                        <GripVertical size={16} />
                      </button>
                    </td>
                  )}
                  <td className="px-3 py-3 text-sm text-accent-blue font-medium">{reorderMode ? i + 1 : (entriesPerPage === 'All' ? 0 : (currentPage - 1) * (entriesPerPage as number)) + i + 1}</td>
                  <td className="px-3 py-3">
                    {product.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.image} alt={product.name} loading="lazy" className="w-10 h-10 rounded object-cover bg-white/10" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-white/10 flex items-center justify-center text-[10px] text-text-muted">No Img</div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-sm text-text-primary font-medium">{product.name}</td>
                  <td className="px-3 py-3 text-sm">
                    {shopFilter ? (
                      (() => {
                        const qty = qtyForBranch(product, shopFilter);
                        const isOut = qty <= 0;
                        const isLow = !isOut && product.quantityAlert > 0 && qty <= product.quantityAlert;
                        return (
                          <span className={`font-medium ${isOut ? 'text-accent-red' : isLow ? 'text-accent-orange' : 'text-text-primary'}`}>
                            {qty}
                            {isOut && <span className="ml-1 text-[10px]">(Out)</span>}
                            {isLow && <span className="ml-1 text-[10px]">(Low)</span>}
                          </span>
                        );
                      })()
                    ) : (
                      <div className="space-y-0.5">
                        {branches.map((b) => {
                          const qty = qtyForBranch(product, b.id);
                          const isOut = qty <= 0;
                          const isLow = !isOut && product.quantityAlert > 0 && qty <= product.quantityAlert;
                          return (
                            <div key={b.id} className="text-xs">
                              <span className="font-semibold text-text-primary">{b.name}:</span>{' '}
                              <span className={`${isOut ? 'text-accent-red font-medium' : isLow ? 'text-accent-orange font-medium' : 'text-accent-blue'}`}>
                                {qty}
                                {isOut && <span className="ml-0.5 text-[9px]">(Out)</span>}
                                {isLow && <span className="ml-0.5 text-[9px]">(Low)</span>}
                              </span>
                            </div>
                          );
                        })}
                        {branches.length === 0 && <span className="text-xs text-text-muted">No shops yet</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-sm text-text-primary">{product.brand?.name ?? '—'}</td>
                  <td className="px-3 py-3 text-sm">
                    {shopFilter ? (
                      <span className="font-medium text-text-primary">₱{(product.quantities.find((q) => q.branchId === shopFilter)?.sellingPrice ?? product.sellingPrice).toFixed(2)}</span>
                    ) : (
                      <div className="space-y-0.5">
                        {/* Key each price to its branch by ID so it aligns row-for-row with
                            the QUANTITY column (which also maps over `branches`). Iterating
                            product.quantities directly relied on Prisma row order and caused
                            prices to appear next to the wrong branch. */}
                        {branches.map((b) => {
                          const price = product.quantities.find((q) => q.branchId === b.id)?.sellingPrice ?? product.sellingPrice;
                          return (
                            <div key={b.id} className="text-xs">
                              <span className="font-medium text-text-primary">₱{price.toFixed(2)}</span>
                            </div>
                          );
                        })}
                        {branches.length === 0 && <span className="text-text-muted">₱{product.sellingPrice.toFixed(2)}</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-sm">
                    {product.quantityAlert > 0 ? (<span className="badge badge-neutral"><span className="badge-dot bg-accent-orange" />{product.quantityAlert}</span>) : (<span className="text-text-muted">{product.quantityAlert}</span>)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {shopFilter && <button onClick={() => setHistoryProduct(product)} className="icon-btn text-text-secondary hover:bg-white/10" title="Stock History"><ClipboardList size={16} /></button>}
                      <button onClick={() => openEditModal(product)} className="icon-btn text-accent-blue hover:bg-accent-blue/10"><Pencil size={16} /></button>
                      <button onClick={() => { setArchivingProduct(product); setFormError(null); setShowArchiveModal(true); }} className="icon-btn text-accent-archive hover:bg-accent-archive/10"><Archive size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Mobile: card list (hidden on desktop). Same data + handlers as the
            table; action buttons are 48px touch targets. */}
        <div className="md:hidden">
          {isLoading ? (
            <div className="py-8 text-center text-text-muted"><Loader2 className="inline animate-spin mr-2" size={16} />Loading products...</div>
          ) : isError ? (
            <div className="py-8 text-center text-accent-red">{getApiErrorMessage(error)}</div>
          ) : rowProducts.length === 0 ? (
            <div className="py-8 text-center text-text-muted">No products found. Add one or import a CSV.</div>
          ) : (
            <ul className="divide-y divide-card-border">
              {rowProducts.map((product, i) => (
                <li
                  key={product.id}
                  data-reorder-row={reorderMode ? '' : undefined}
                  data-reorder-id={reorderMode ? product.id : undefined}
                  className={`p-4 transition-colors ${reorderMode && dragIndex === i ? 'opacity-50' : ''} ${reorderMode && overIndex === i && dragIndex !== i ? 'bg-accent-green/10' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    {reorderMode && (
                      <button
                        type="button"
                        onPointerDown={(e) => startDrag(i, e)}
                        className="flex h-12 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded text-text-muted active:cursor-grabbing"
                        title="Drag to reorder"
                        aria-label={`Drag ${product.name} to reorder`}
                      >
                        <GripVertical size={20} />
                      </button>
                    )}
                    {product.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.image} alt={product.name} loading="lazy" className="h-12 w-12 shrink-0 rounded object-cover bg-white/10" />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-white/10 text-[10px] text-text-muted">No Img</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-text-primary">
                        <span className="text-text-muted mr-1.5">{reorderMode ? i + 1 : (entriesPerPage === 'All' ? 0 : (currentPage - 1) * (entriesPerPage as number)) + i + 1}.</span>
                        {product.name}
                      </p>
                      <p className="mt-0.5 text-xs text-text-secondary">{product.brand?.name ?? '—'}</p>
                    </div>
                    <div className="flex shrink-0 items-center">
                      {shopFilter && <button onClick={() => setHistoryProduct(product)} className="flex h-12 w-12 items-center justify-center rounded-lg text-text-secondary hover:bg-white/10 transition-colors" title="Stock History" aria-label="Stock history"><ClipboardList size={18} /></button>}
                      <button onClick={() => openEditModal(product)} className="flex h-12 w-12 items-center justify-center rounded-lg text-accent-blue hover:bg-accent-blue/10 transition-colors" title="Edit" aria-label={`Edit ${product.name}`}><Pencil size={18} /></button>
                      <button onClick={() => { setArchivingProduct(product); setFormError(null); setShowArchiveModal(true); }} className="flex h-12 w-12 items-center justify-center rounded-lg text-accent-archive hover:bg-accent-archive/10 transition-colors" title="Archive" aria-label={`Archive ${product.name}`}><Archive size={18} /></button>
                    </div>
                  </div>

                  {/* Quantity + price per branch (or single when a shop filter is on) */}
                  <div className="mt-3 rounded-lg bg-surface-muted p-3 text-xs">
                    {shopFilter ? (
                      (() => {
                        const qty = qtyForBranch(product, shopFilter);
                        const isOut = qty <= 0;
                        const isLow = !isOut && product.quantityAlert > 0 && qty <= product.quantityAlert;
                        const price = product.quantities.find((q) => q.branchId === shopFilter)?.sellingPrice ?? product.sellingPrice;
                        return (
                          <div className="flex items-center justify-between">
                            <span className={`font-medium ${isOut ? 'text-accent-red' : isLow ? 'text-accent-orange' : 'text-text-primary'}`}>
                              Qty: {qty}{isOut && ' (Out)'}{isLow && ' (Low)'}
                            </span>
                            <span className="font-medium text-text-primary">₱{price.toFixed(2)}</span>
                          </div>
                        );
                      })()
                    ) : branches.length === 0 ? (
                      <div className="flex items-center justify-between">
                        <span className="text-text-muted">No shops yet</span>
                        <span className="font-medium text-text-primary">₱{product.sellingPrice.toFixed(2)}</span>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {branches.map((b) => {
                          const qty = qtyForBranch(product, b.id);
                          const isOut = qty <= 0;
                          const isLow = !isOut && product.quantityAlert > 0 && qty <= product.quantityAlert;
                          const price = product.quantities.find((q) => q.branchId === b.id)?.sellingPrice ?? product.sellingPrice;
                          return (
                            <div key={b.id} className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-text-primary truncate">{b.name}</span>
                              <span className="flex items-center gap-2 shrink-0">
                                <span className={`${isOut ? 'text-accent-red font-medium' : isLow ? 'text-accent-orange font-medium' : 'text-accent-blue'}`}>
                                  {qty}{isOut && ' (Out)'}{isLow && ' (Low)'}
                                </span>
                                <span className="text-text-primary">₱{price.toFixed(2)}</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-1.5 border-t border-card-border pt-2 text-text-muted">
                      Qty Alert:
                      {product.quantityAlert > 0 ? (
                        <span className="badge badge-neutral"><span className="badge-dot bg-accent-orange" />{product.quantityAlert}</span>
                      ) : (
                        <span>{product.quantityAlert}</span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between text-sm text-text-secondary">
        <span>Showing {displayProducts.length === 0 ? 0 : ((entriesPerPage === 'All' ? 0 : (currentPage - 1) * (entriesPerPage as number)) + 1)} to {entriesPerPage === 'All' ? products.length : Math.min(currentPage * (entriesPerPage as number), products.length)} of {products.length} products</span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="px-2 py-1 rounded border border-card-border disabled:opacity-50">Previous</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (<button key={p} onClick={() => setCurrentPage(p)} className={`px-2.5 py-1 rounded ${p === currentPage ? 'bg-btn-primary text-btn-primary-text' : 'border border-card-border hover:opacity-80'}`}>{p}</button>))}
            <button onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="px-2 py-1 rounded border border-card-border disabled:opacity-50">Next</button>
          </div>
        )}
      </div>

      {showAddModal && (
        <ProductFormModal title="Add New Product" onClose={closeAdd} onDirty={() => setFormDirty(true)} onSubmit={handleAdd} error={formError} buttonLabel={createProduct.isPending ? 'Saving...' : 'Save Product'} disabled={createProduct.isPending} formName={formName} setFormName={setFormName} formBrand={formBrand} setFormBrand={setFormBrand} formPrice={formPrice} setFormPrice={setFormPrice} formCostPrice={formCostPrice} setFormCostPrice={setFormCostPrice} isOwner={isOwner} formAlert={formAlert} setFormAlert={setFormAlert} formImage={formImage} setFormImage={setFormImage} isAdmin={isAdmin} formQuantities={formQuantities} setFormQuantities={setFormQuantities} branches={branchesForForm} brands={brands} />
      )}
      {showEditModal && editingProduct && (
        <ProductFormModal title="Edit Product" onClose={closeEdit} onDirty={() => setFormDirty(true)} onSubmit={handleEdit} error={formError} buttonLabel={updateProduct.isPending ? 'Saving...' : 'Update Product'} disabled={updateProduct.isPending} formName={formName} setFormName={setFormName} formBrand={formBrand} setFormBrand={setFormBrand} formPrice={formPrice} setFormPrice={setFormPrice} formCostPrice={formCostPrice} setFormCostPrice={setFormCostPrice} isOwner={isOwner} formAlert={formAlert} setFormAlert={setFormAlert} formImage={formImage} setFormImage={setFormImage} isAdmin={isAdmin} formQuantities={formQuantities} setFormQuantities={setFormQuantities} branches={branchesForEdit} brands={brands} />
      )}
      {showArchiveModal && archivingProduct && (
        <Modal title="Confirm Archive" onClose={() => { setShowArchiveModal(false); setArchivingProduct(null); }}>
          <div className="space-y-4">
            <p className="text-sm text-text-primary">Are you sure you want to archive <strong>{archivingProduct.name}</strong>?</p>
            {formError && <p className="text-sm text-accent-red">{formError}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowArchiveModal(false); setArchivingProduct(null); }} className="btn-secondary text-text-primary px-4 py-2 rounded text-sm font-medium">Cancel</button>
              <button onClick={handleArchive} disabled={archiveProduct.isPending} className="bg-accent-archive text-white px-4 py-2 rounded text-sm font-medium hover:opacity-90 transition disabled:opacity-60">{archiveProduct.isPending ? 'Archiving...' : 'Yes, Archive'}</button>
            </div>
          </div>
        </Modal>
      )}
      {showImportModal && <ImportModal branches={branches} onClose={() => setShowImportModal(false)} />}
      {showRestockModal && <RestockModal products={products} branches={branches} isOwner={isOwner} onClose={() => setShowRestockModal(false)} />}
      {historyProduct && shopFilter && <StockHistoryModal productId={historyProduct.id} productName={historyProduct.name} branchId={shopFilter} branchName={branches.find((b) => b.id === shopFilter)?.name ?? ''} isOwner={isOwner} onClose={() => setHistoryProduct(null)} />}
      {showResetModal && isOwner && (
        <Modal title="Reset all stock to 0?" onClose={() => { if (!resetAllStock.isPending) { setShowResetModal(false); setResetConfirmText(''); } }}>
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-accent-red/30 bg-accent-red/10 p-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-accent-red" />
              <div className="text-sm text-text-primary">
                <p className="font-semibold text-accent-red">This wipes ALL stock at EVERY shop.</p>
                <p className="mt-1 text-text-secondary">Every product&apos;s quantity will be set to <strong>0</strong> across all branches. This is logged in each product&apos;s Stock History, but it affects your whole inventory. Consider clicking <strong>Export</strong> first to keep a backup.</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Type <span className="font-mono font-bold">RESET</span> to confirm</label>
              <input
                type="text"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="RESET"
                autoFocus
                className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowResetModal(false); setResetConfirmText(''); }} disabled={resetAllStock.isPending} className="btn-secondary text-text-primary px-4 py-2 rounded text-sm font-medium disabled:opacity-60">Cancel</button>
              <button
                onClick={handleResetAllStock}
                disabled={resetAllStock.isPending || resetConfirmText.trim().toUpperCase() !== 'RESET'}
                className="bg-accent-red text-white px-4 py-2 rounded text-sm font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {resetAllStock.isPending ? 'Resetting...' : 'Reset all to 0'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ImportModal({ branches, onClose }: { branches: { id: string; name: string }[]; onClose: () => void }) {
  const importProducts = useImportProducts();
  const [rows, setRows] = useState<ImportProductRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const branchNameSet = new Set(branches.map((b) => b.name.toLowerCase()));

  async function onFile(file: File) {
    setError(null); setResult(null);
    try {
      // Accept both Excel (.xlsx) and CSV. .xlsx is parsed via the xlsx lib
      // (already shipped for export/template) into the SAME { headers, rows }
      // shape the CSV parser returns, so everything below is format-agnostic.
      const isXlsx = /\.xlsx$/i.test(file.name);
      let headers: string[];
      let csvRows: Record<string, string>[];
      if (isXlsx) {
        const { parseXlsxFile } = await import('@/lib/xlsx-utils');
        ({ headers, rows: csvRows } = await parseXlsxFile(file));
      } else {
        const text = await readFileAsText(file);
        ({ headers, rows: csvRows } = parseCsv(text));
      }
      const required = ['Name', 'Brand', 'SellingPrice'];
      const missing = required.filter((h) => !headers.includes(h));
      if (missing.length) { setError(`Missing required column(s): ${missing.join(', ')}`); return; }
      const branchCols = headers.filter((h) => branchNameSet.has(h.toLowerCase()));
      const parsed: ImportProductRow[] = csvRows
        .filter((r) => r.Name?.trim())
        .map((r) => ({
          name: r.Name.trim(),
          brand: (r.Brand || '').trim(),
          sellingPrice: Number(r.SellingPrice) || 0,
          quantityAlert: Number(r.QuantityAlert) || 0,
          quantities: branchCols
            .map((col) => ({ branchName: col, quantity: Number(r[col]) || 0 }))
            .filter((q) => q.quantity > 0),
        }));
      setRows(parsed);
      setFileName(file.name);
    } catch (e) { setError('Could not read the file.'); }
  }

  async function submit() {
    if (rows.length === 0) { setError('No valid rows to import.'); return; }
    setError(null);
    try { setResult(await importProducts.mutateAsync(rows)); }
    catch (e) { setError(getApiErrorMessage(e)); }
  }

  return (
    <Modal title="Import Products (Excel or CSV)" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-text-muted">
          Accepts <strong>.xlsx</strong> or <strong>.csv</strong>. Columns: <strong>Name, Brand, SellingPrice, QuantityAlert</strong>, plus one column per shop name for stock. Brands are created automatically if they don&apos;t exist. Existing products (matched by name) are updated.
        </p>
        <input type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg" />
        {fileName && <p className="text-sm text-text-secondary">Parsed <strong>{rows.length}</strong> row(s) from {fileName}.</p>}
        {error && <p className="text-sm text-accent-red">{error}</p>}
        {result && (
          <div className="rounded-lg bg-accent-green/10 border border-accent-green/30 px-3 py-2 text-sm text-text-primary">
            <p>Imported: <strong>{result.created}</strong> created, <strong>{result.updated}</strong> updated (of {result.total}).</p>
            {result.warnings.length > 0 && (
              <ul className="mt-1 list-disc list-inside text-accent-orange text-xs max-h-28 overflow-y-auto">
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary text-text-primary px-4 py-2 rounded text-sm font-medium">{result ? 'Done' : 'Cancel'}</button>
          {!result && <button onClick={submit} disabled={importProducts.isPending || rows.length === 0} className="btn-grad px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60">{importProducts.isPending ? 'Importing...' : `Import ${rows.length || ''}`}</button>}
        </div>
      </div>
    </Modal>
  );
}

interface RestockRow { productId: string; branchId: string; quantity: string; }

// Remembers the last restock the owner actually SUBMITTED this session, so we
// can warn if they upload what looks like the exact same file again (a restock
// ADDS to stock, so re-submitting the same file would double the numbers).
// Module-level so it survives closing/reopening the Restock modal.
let lastSubmittedRestockSignature: string | null = null;

function RestockModal({ products, branches, isOwner, onClose }: { products: Product[]; branches: { id: string; name: string }[]; isOwner: boolean; onClose: () => void }) {
  const restock = useRestock({ silent: true });
  const undoStock = useUndoStock();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RestockResult | null>(null);

  const [csvItems, setCsvItems] = useState<RestockItem[]>([]);
  const [fileName, setFileName] = useState('');
  // Product names in the file that don't match any product in the system.
  // Restock refuses the WHOLE upload if any exist — so we surface them here
  // BEFORE the user submits, and block the button.
  const [unmatchedProducts, setUnmatchedProducts] = useState<string[]>([]);
  // True when this exact file (same items + totals) was just submitted — a
  // guard against accidentally adding the same delivery twice.
  const [duplicateWarned, setDuplicateWarned] = useState(false);

  const branchNameSet = new Set(branches.map((b) => b.name.toLowerCase()));
  const branchNames = branches.map((b) => b.name);
  const productNameSet = new Set(products.map((p) => p.name.trim().toLowerCase()));

  // A stable fingerprint of the parsed additions (order-independent) so we can
  // detect a re-upload of the same file/numbers.
  function signatureOf(items: RestockItem[]): string {
    return items
      .map((i) => `${(i.productName ?? '').trim().toLowerCase()}|${(i.branchName ?? '').trim().toLowerCase()}|${i.quantity}`)
      .sort()
      .join(';');
  }

  async function onFile(file: File) {
    setError(null); setResult(null); setCsvItems([]); setFileName(''); setUnmatchedProducts([]); setDuplicateWarned(false);
    try {
      // Load the xlsx helpers on demand (only when the user imports a file).
      const { parseRestockXlsx, matchSlugToShopName, readFileAsArrayBuffer } = await import('@/lib/xlsx-utils');
      let headers: string[];
      let csvRows: Record<string, string>[];

      const isXlsx = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      if (isXlsx) {
        const buffer = await readFileAsArrayBuffer(file);
        const parsed = parseRestockXlsx(buffer, branchNames);
        headers = parsed.headers;
        csvRows = parsed.rows;
      } else {
        const text = await readFileAsText(file);
        const parsed = parseCsv(text);
        headers = parsed.headers;
        csvRows = parsed.rows;
      }

      // Accept both "Name" and "ProductName" as the product name column
      const nameCol = headers.find((h) => h.toLowerCase() === 'name' || h.toLowerCase() === 'productname') ?? null;
      if (!nameCol) {
        setError('This file does not look like a products export (missing a "Name" or "ProductName" column).');
        return;
      }

      // Match shop columns — support both plain names and slug format
      const branchColMap: { header: string; shopName: string }[] = [];
      for (const h of headers) {
        if (['productid', 'productname', 'name', 'brand', 'sellingprice', 'quantityalert'].includes(h.toLowerCase())) continue;
        if (branchNameSet.has(h.toLowerCase())) {
          const match = branches.find((b) => b.name.toLowerCase() === h.toLowerCase());
          if (match) branchColMap.push({ header: h, shopName: match.name });
        } else {
          const matched = matchSlugToShopName(h, branchNames);
          if (matched) branchColMap.push({ header: h, shopName: matched });
        }
      }

      if (branchColMap.length === 0) {
        setError('No shop columns found in the file. Use the Export button to get the correct format.');
        return;
      }
      const items: RestockItem[] = [];
      const unmatched = new Set<string>();
      for (const r of csvRows) {
        const productName = (r[nameCol] ?? '').trim();
        if (!productName) continue;
        // Flag product names that won't match anything in the system — the
        // backend refuses the whole upload if any are present, so we warn now.
        if (!productNameSet.has(productName.toLowerCase())) unmatched.add(productName);
        for (const { header, shopName } of branchColMap) {
          const qty = Number(r[header]) || 0;
          if (qty > 0) items.push({ productName, branchName: shopName, quantity: qty });
        }
      }
      setCsvItems(items);
      setUnmatchedProducts([...unmatched]);
      setFileName(file.name);
      // Warn if this exact set of additions was already submitted this session.
      setDuplicateWarned(items.length > 0 && signatureOf(items) === lastSubmittedRestockSignature);
    } catch {
      setError('Could not read the file.');
    }
  }

  async function submit() {
    const items = csvItems;
    if (items.length === 0) { setError('No stock to add. Edit the shop columns in the exported file (numbers greater than 0) and re-upload.'); return; }
    if (unmatchedProducts.length > 0) {
      setError(`Can't restock: ${unmatchedProducts.length} product name(s) in the file don't exist in the system. Fix the file and re-upload — nothing has been changed.`);
      return;
    }
    setError(null);
    try {
      const res = await restock.mutateAsync(items);
      // Remember this exact submission so an accidental re-upload is caught.
      lastSubmittedRestockSignature = signatureOf(items);
      setResult(res);
      const ids = Array.isArray((res as any)?.movementIds) ? (res as any).movementIds as string[] : [];
      const msg = `Restocked ${res.updated} of ${res.total} ${res.total === 1 ? 'entry' : 'entries'}`;
      if (isOwner && ids.length > 0) {
        toast.show('success', msg, {
          action: {
            label: 'Undo',
            onClick: async () => {
              try {
                const u = await undoStock.mutateAsync(ids);
                if (u.undone > 0) toast.success(`Reverted ${u.undone} ${u.undone === 1 ? 'entry' : 'entries'}.`, 'Undone');
                else toast.error(u.skipped[0]?.reason ?? 'Nothing to undo.');
              } catch (e) {
                toast.error(getApiErrorMessage(e));
              }
            },
          },
        });
      } else {
        toast.success(msg);
      }
    }
    catch (e) { setError(getApiErrorMessage(e)); }
  }

  return (
    <Modal title="Restock Products" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Upload Excel File</label>
          <input type="file" accept=".xlsx,.xls" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg" />
        </div>
        {fileName && !result && (
          <div className="rounded-lg border border-card-border bg-white/5 px-3 py-2 text-sm text-text-secondary space-y-1">
            <p>
              Ready to <strong>add</strong> stock: <strong>{csvItems.reduce((s, c) => s + c.quantity, 0)}</strong> unit(s) across{' '}
              <strong>{new Set(csvItems.map((c) => (c.productName ?? '').trim().toLowerCase())).size}</strong> product(s) and{' '}
              <strong>{new Set(csvItems.map((c) => (c.branchName ?? '').trim().toLowerCase())).size}</strong> shop(s), from {fileName}.
            </p>
            <p className="text-xs text-text-muted">These quantities are <strong>added</strong> to current stock (a delivery), not set as the new totals.</p>
          </div>
        )}

        {/* Unmatched products block the whole upload (server refuses partials). */}
        {unmatchedProducts.length > 0 && !result && (
          <div className="rounded-lg border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-sm text-accent-red">
            <p className="font-semibold">{unmatchedProducts.length} product name(s) don&apos;t match the system — the whole upload is blocked.</p>
            <p className="mt-1 text-xs">Fix these names in the file (they must match exactly), then re-upload. Nothing will be changed until every row matches.</p>
            <ul className="mt-1 list-disc list-inside text-xs max-h-24 overflow-y-auto">
              {unmatchedProducts.slice(0, 15).map((n) => <li key={n}>{n}</li>)}
              {unmatchedProducts.length > 15 && <li>…and {unmatchedProducts.length - 15} more</li>}
            </ul>
          </div>
        )}

        {/* Double-upload guard: same file/numbers already submitted this session. */}
        {duplicateWarned && unmatchedProducts.length === 0 && !result && (
          <div className="rounded-lg border border-accent-orange/40 bg-accent-orange/10 px-3 py-2 text-sm text-accent-orange">
            <p className="font-semibold">This looks like the same file you just restocked.</p>
            <p className="mt-1 text-xs">Restock <strong>adds</strong> to stock, so submitting again will double these quantities. Only continue if this is a new delivery.</p>
          </div>
        )}

        {error && <p className="text-sm text-accent-red">{error}</p>}
        {result && (
          <div className="rounded-lg bg-accent-green/10 border border-accent-green/30 px-3 py-2 text-sm text-text-primary">
            Restocked <strong>{result.updated}</strong> of {result.total} entries.
            {result.warnings.length > 0 && <ul className="mt-1 list-disc list-inside text-accent-orange text-xs max-h-28 overflow-y-auto">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary text-text-primary px-4 py-2 rounded text-sm font-medium">{result ? 'Done' : 'Close'}</button>
          {!result && (
            <button
              onClick={submit}
              disabled={restock.isPending || csvItems.length === 0 || unmatchedProducts.length > 0}
              className="btn-grad px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {restock.isPending ? 'Restocking...' : duplicateWarned ? 'Add anyway' : 'Restock Products'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ProductFormModal({ title, onClose, onDirty, onSubmit, buttonLabel, disabled, error, formName, setFormName, formBrand, setFormBrand, formPrice, setFormPrice, formCostPrice, setFormCostPrice, isOwner, formAlert, setFormAlert, formImage, setFormImage, isAdmin, formQuantities, setFormQuantities, branches, brands }: {
  title: string; onClose: () => void; onDirty: () => void; onSubmit: () => void; buttonLabel: string; disabled?: boolean; error?: string | null;
  formName: string; setFormName: (v: string) => void; formBrand: string; setFormBrand: (v: string) => void;
  formPrice: string; setFormPrice: (v: string) => void; formCostPrice: string; setFormCostPrice: (v: string) => void; isOwner: boolean; formAlert: string; setFormAlert: (v: string) => void;
  formImage: string | null; setFormImage: (v: string | null) => void; isAdmin: boolean;
  formQuantities: Record<string, string>; setFormQuantities: (v: Record<string, string>) => void;
  branches: { id: string; name: string }[]; brands: { id: string; name: string }[];
}) {
  const [imageError, setImageError] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);

  function handleImageFile(file: File) {
    setImageError(null);
    // Open the square cropper; the cropped 256px thumbnail is applied below.
    setCropFile(file);
  }

  return (
    <Modal title={title} onClose={onClose}>
      {/* onInput anywhere in the form marks it dirty so the close guard can warn
          about unsaved edits (covers inputs, the Select, and file picks). */}
      <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-1 sm:pr-2" onInput={onDirty}>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Name <span className="text-accent-red">*</span></label>
          <input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus" />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">Quantity</label>
          {branches.length === 1 ? (
            <NumberStepper min={0} placeholder="0" ariaLabel="Quantity" value={formQuantities[branches[0].id] ?? ''} onChange={(v) => setFormQuantities({ ...formQuantities, [branches[0].id]: v })} className="w-full" />
          ) : (
          <div className="divide-y divide-card-border border border-card-border rounded-lg overflow-hidden">
            {branches.length === 0 && <p className="text-xs text-text-muted px-3 py-3">No shops yet. Create a shop first.</p>}
            {branches.map((b) => (
              <div key={b.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-3">
                <span className="w-full text-xs font-semibold text-text-primary bg-white/10 border-l-[3px] border-accent-blue px-2.5 py-1.5 rounded-r uppercase break-words sm:w-auto sm:min-w-[140px] sm:max-w-[200px]">{b.name}</span>
                <NumberStepper min={0} placeholder="0" ariaLabel={`${b.name} quantity`} value={formQuantities[b.id] ?? ''} onChange={(v) => setFormQuantities({ ...formQuantities, [b.id]: v })} className="w-full sm:flex-1" />
              </div>
            ))}
          </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Brand <span className="text-accent-red">*</span></label>
          <Select value={formBrand} onChange={setFormBrand} ariaLabel="Brand" placeholder="Select a brand" className="w-full" options={brands.map((b) => ({ value: b.id, label: b.name }))} />
          {brands.length === 0 && <p className="text-xs text-text-muted mt-1">No brands yet. Create a brand first.</p>}
        </div>
        {isOwner && (
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">Cost Price (₱)</label>
            <input type="number" step="0.01" min="0" value={formCostPrice} onChange={(e) => setFormCostPrice(e.target.value)} placeholder="0" className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus" />
            <p className="text-xs text-text-muted mt-1">Owner-only &amp; private. Never shown to staff or included in Excel export.</p>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Selling Price (₱)</label>
          <input type="number" step="0.01" min="0" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} placeholder="0" className="w-full border border-input-border rounded px-3 py-2 text-sm bg-input-bg focus:outline-none focus:border-input-focus" />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1">Quantity Alert</label>
          <NumberStepper min={0} placeholder="0" ariaLabel="Quantity alert" value={formAlert} onChange={setFormAlert} className="w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-primary mb-2">Product Image</label>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded bg-white/10 overflow-hidden flex items-center justify-center shrink-0 border border-card-border">
              {formImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={formImage} alt="Product preview" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[10px] text-text-muted">No Image</span>
              )}
            </div>
            {isAdmin ? (
              <div className="flex-1 space-y-2">
                <div className="border border-input-border rounded-lg px-3 py-2 flex items-center gap-2 bg-input-bg">
                  <input type="file" accept="image/*" onChange={(e) => { if (e.target.files?.[0]) handleImageFile(e.target.files[0]); e.currentTarget.value = ''; }} className="w-full text-xs text-text-secondary file:mr-2 file:py-1.5 file:px-3 file:rounded file:border file:border-input-border file:bg-btn-primary file:text-btn-primary-text file:text-xs file:cursor-pointer" />
                </div>
                {formImage && (
                  <button type="button" onClick={() => { setFormImage(null); setImageError(null); }} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent-red/10 border border-accent-red/30 text-xs font-medium text-accent-red hover:bg-accent-red/20 transition-colors">
                    <Trash2 size={12} /> Remove
                  </button>
                )}
                {imageError && <p className="text-xs text-accent-red">{imageError}</p>}
              </div>
            ) : (
              <p className="flex-1 text-xs text-text-muted">Only an admin can change the product image.</p>
            )}
          </div>
        </div>
        {error && <p className="text-sm text-accent-red">{error}</p>}
        <div className="flex justify-end pt-2">
          <button onClick={onSubmit} disabled={disabled} className="btn-grad px-5 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 transition disabled:opacity-60">{buttonLabel}</button>
        </div>
      </div>
      {cropFile && (
        <ImageCropModal
          file={cropFile}
          title="Crop product image"
          onCancel={() => setCropFile(null)}
          onCropped={(dataUrl) => { setFormImage(dataUrl); setCropFile(null); }}
        />
      )}
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="glass relative rounded-xl shadow-xl w-full max-w-2xl mx-4 p-5 sm:p-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-text-primary">{title}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
