import type { Sale, SaleLineItem } from './types';

/**
 * Client-side product search for the sales tables (Pending Sales, Sales Records,
 * Staff Reports "View by Sale").
 *
 * The backend search matches at the SALE level, so a sale that contains ONE
 * matching item is returned with ALL its items — which made searching a product
 * look like it "didn't filter" (you'd still see every other item in that sale).
 *
 * This helper instead filters to the matching ITEM rows: for each sale it keeps
 * only the items whose product name OR brand matches the query, drops sales that
 * have no matching item, and returns a `visibleTotal` (the sum of the kept
 * items' subTotals) so the per-sale total row reflects exactly what's shown.
 *
 * When the query is empty, the sales are returned unchanged (with visibleTotal
 * equal to the sale's own total) so normal (unsearched) rendering is untouched.
 */
export interface FilteredSale extends Sale {
  /** Sum of the subTotals of the items kept after filtering. Equals `total`
   *  when there is no active search. */
  visibleTotal: number;
}

function itemMatches(item: SaleLineItem, q: string): boolean {
  return (
    item.name.toLowerCase().includes(q) ||
    item.brandName.toLowerCase().includes(q)
  );
}

/**
 * @param sales  the sales as loaded from the API
 * @param search the raw search text (may be empty/whitespace)
 * @returns sales with items filtered to the query; sales with no match removed
 */
export function filterSalesByProduct<T extends Sale>(
  sales: T[],
  search: string,
): (T & { visibleTotal: number })[] {
  const q = search.trim().toLowerCase();

  // No search: return every sale unchanged, visibleTotal = the sale's own total.
  if (!q) {
    return sales.map((sale) => ({ ...sale, visibleTotal: sale.total }));
  }

  const result: (T & { visibleTotal: number })[] = [];
  for (const sale of sales) {
    const matchingItems = sale.items.filter((it) => itemMatches(it, q));
    if (matchingItems.length === 0) continue; // no matching item -> hide this sale
    const visibleTotal = matchingItems.reduce((sum, it) => sum + it.subTotal, 0);
    result.push({ ...sale, items: matchingItems, visibleTotal });
  }
  return result;
}
