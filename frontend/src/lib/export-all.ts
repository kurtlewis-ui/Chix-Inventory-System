/**
 * Export All Data — generates a complete backup xlsx with all sales,
 * disposals, expenses, and inventory. Admin-only feature.
 * Uses pagination to fetch ALL records regardless of backend limit.
 */
import * as XLSX from 'xlsx-js-style';
import { styleHeaderRow } from './xlsx-utils';
import { api } from './api';

function formatSplitBreakdown(
  split: { cash: number; gcash: number; bankTransfer?: number } | null,
): string {
  if (!split) return '';
  const parts: string[] = [];
  if (split.cash > 0) parts.push(`Cash ${split.cash}`);
  if (split.gcash > 0) parts.push(`Gcash ${split.gcash}`);
  if ((split.bankTransfer ?? 0) > 0) parts.push(`Bank ${split.bankTransfer}`);
  return parts.join(' / ');
}

/**
 * Fetch all pages from a paginated API endpoint.
 */
async function fetchAllPages(
  url: string,
  params?: Record<string, unknown>,
  onProgress?: (page: number, total: number) => void,
): Promise<any[]> {
  const limit = 200;
  let page = 1;
  let allData: any[] = [];
  let hasMore = true;

  while (hasMore) {
    const res = await api.get(url, { params: { ...params, limit, page } });
    const data = res.data.data ?? [];
    allData = [...allData, ...data];

    const pagination = res.data.pagination;
    if (pagination) {
      if (onProgress) onProgress(page, pagination.totalPages);
      hasMore = pagination.hasNext;
    } else {
      hasMore = false;
    }
    page++;
  }

  return allData;
}

export async function exportAllData(
  onProgress?: (status: string) => void,
): Promise<void> {
  onProgress?.('Fetching sales...');
  const sales = await fetchAllPages('/sales/records', {}, (p, t) => onProgress?.(`Fetching sales... page ${p}/${t}`));

  onProgress?.('Fetching disposals...');
  const disposals = await fetchAllPages('/disposals', {}, (p, t) => onProgress?.(`Fetching disposals... page ${p}/${t}`));

  onProgress?.('Fetching expenses...');
  const expenses = await fetchAllPages('/expenses', {}, (p, t) => onProgress?.(`Fetching expenses... page ${p}/${t}`));

  onProgress?.('Fetching products...');
  const products = await fetchAllPages('/products', {}, (p, t) => onProgress?.(`Fetching products... page ${p}/${t}`));

  onProgress?.('Generating file...');

  // --- Sheet 1: Sales ---
  const salesHeaders = [
    'Sale #', 'Customer', 'Shop', 'Staff', 'Status', 'Product', 'Brand',
    'Qty', 'Unit Price', 'Discount', 'Sub Total', 'Payment Method',
    'Split Breakdown', 'Note', 'Sale Total', 'Date', 'Decided At',
  ];
  const salesRows: (string | number)[][] = [];
  for (const sale of sales) {
    for (const item of sale.items ?? []) {
      salesRows.push([
        sale.number,
        sale.customerName ?? '',
        sale.branch?.name ?? '',
        sale.staff?.name ?? '',
        sale.status,
        item.name,
        item.brandName,
        item.quantity,
        item.unitPrice,
        item.discount,
        item.subTotal,
        item.paymentMethod,
        formatSplitBreakdown(item.paymentSplit),
        item.note ?? '',
        sale.total,
        new Date(sale.createdAt).toLocaleString(),
        sale.decidedAt ? new Date(sale.decidedAt).toLocaleString() : '',
      ]);
    }
  }

  // --- Sheet 2: Disposals ---
  const disposalsHeaders = [
    'Product', 'Brand', 'Shop', 'Qty', 'Unit Price', 'Value',
    'Reason', 'Status', 'Requested By', 'Date',
  ];
  const disposalsRows = disposals.map((d: any) => [
    d.name,
    d.brandName,
    d.branch?.name ?? '',
    d.quantity,
    d.unitPrice,
    d.value,
    d.reason ?? '',
    d.status,
    d.createdBy,
    new Date(d.createdAt).toLocaleString(),
  ]);

  // --- Sheet 3: Expenses ---
  const expensesHeaders = [
    'Staff', 'Shop', 'Amount', 'Note', 'Status', 'Date',
  ];
  const expensesRows = expenses.map((e: any) => [
    e.staff?.name ?? '',
    e.branch?.name ?? '',
    e.amount,
    e.note,
    e.status,
    new Date(e.createdAt).toLocaleString(),
  ]);

  // --- Sheet 4: Inventory ---
  const branchNames = new Set<string>();
  for (const p of products) {
    for (const q of p.quantities ?? []) {
      if (q.branchName) branchNames.add(q.branchName);
    }
  }
  const branchList = [...branchNames].sort();
  const inventoryHeaders = [
    'Product', 'Brand', 'Selling Price', 'Qty Alert',
    ...branchList.map((b: string) => `Stock: ${b}`),
  ];
  const inventoryRows = products.map((p: any) => [
    p.name,
    p.brand?.name ?? '',
    p.sellingPrice,
    p.quantityAlert,
    ...branchList.map((b) => {
      const q = (p.quantities ?? []).find((x: any) => x.branchName === b);
      return q?.quantity ?? 0;
    }),
  ]);

  // --- Build workbook ---
  const wb = XLSX.utils.book_new();

  const wsSales = XLSX.utils.aoa_to_sheet([salesHeaders, ...salesRows]);
  wsSales['!cols'] = salesHeaders.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  styleHeaderRow(wsSales, salesHeaders.length);
  XLSX.utils.book_append_sheet(wb, wsSales, 'Sales');

  const wsDisposals = XLSX.utils.aoa_to_sheet([disposalsHeaders, ...disposalsRows]);
  wsDisposals['!cols'] = disposalsHeaders.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  styleHeaderRow(wsDisposals, disposalsHeaders.length);
  XLSX.utils.book_append_sheet(wb, wsDisposals, 'Disposals');

  const wsExpenses = XLSX.utils.aoa_to_sheet([expensesHeaders, ...expensesRows]);
  wsExpenses['!cols'] = expensesHeaders.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  styleHeaderRow(wsExpenses, expensesHeaders.length);
  XLSX.utils.book_append_sheet(wb, wsExpenses, 'Expenses');

  const wsInventory = XLSX.utils.aoa_to_sheet([inventoryHeaders, ...inventoryRows]);
  wsInventory['!cols'] = inventoryHeaders.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  styleHeaderRow(wsInventory, inventoryHeaders.length);
  XLSX.utils.book_append_sheet(wb, wsInventory, 'Inventory');

  // --- Download ---
  const filename = `vape-shop-full-backup-${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}
