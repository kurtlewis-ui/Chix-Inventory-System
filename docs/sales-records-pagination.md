# Chix Sales Records

Sales Records opens on All Shops and All Time independently of the shared branch selection elsewhere. Filter order is SHOPS, PERIOD, FROM, TO with neutral icons. Periods include Daily/Today, Weekly/This Week, Monthly/This Month, Yearly/This Year, All Time and manual From/To dates. Chix retains its midnight-to-midnight Philippine calendar, Monday weeks and one cutoff timer for presets; there is no new polling interval. Custom ranges require both dates and reject reversed ranges. Clear Filter restores the initial state.

The page requests ten sales at a time from the records endpoint and uses the server's complete matching count/page metadata. It no longer pages only the first 200 downloaded sales. Ordering uses createdAt then id to make tied timestamps stable. Each sale stays together, with its own item rows and total. Navigation is disabled while fetching or waiting for search debounce.

Records product/brand search runs before server pagination and count, so matches beyond the former 200-sale boundary remain accessible. The visible sale contains only matching item rows, with a matching visible total. The payment summary sums matching item rows across all result pages, including discounts and split payments. Percent/underscore characters are literal in Records search. Pending Sales keeps its existing broader search behavior. Staff branch restrictions remain server-enforced.

No migration or live data changes. Validation uses service pagination/role tests, PostgreSQL payment-summary fixtures and mocked browser flows for more than 200 records, rare-product search, presets/custom dates, default filters, mobile and light/dark layouts.

## Exact product and quantity totals

Records adds Total Quantity Sold (units) and Matching Transactions to its all-pages summary. Quantity is summed from approved matching item rows in PostgreSQL; matching-sales count counts each qualifying sale once. With no product filter both cover all matching products; text search covers literal matching product/brand names. Exact-product selection uses the saved product ID, so similarly named products remain separate while historical renames of one ID stay together.

A searchable, paginated Exact Product picker reads approved historical items under the selected shop/date scope, including archived or removed catalog entries. Deleted rows without a catalog ID use their saved product/brand labels as a fallback identity. As those rows no longer retain their original product IDs, identical deleted labels share that historical identity. The choices endpoint returns only identity/name/brand, fetches twenty options per page while open, caches briefly, and adds no background polling.

Exact filtering runs before the sale count, item include, summary and pagination. The returned sale total is the sum of matching item subtotals, excluding other products in the same transaction. The active filter bar shows the product, shop and dates; Clear Product retains the other filters and Clear Filter resets all. Selecting an exact product clears broad text search; typing broad search clears the exact selection. Summary labels state that totals cover every matching page.

Validation includes mixed-product sales, exact ID vs similarly named sibling, historical renames/deleted identities, approved-only scope, shop/date exclusions, product-choice pagination, quantity/money across result pages and mobile/light/dark Owner/Admin browser flows.


## Row selection

Rows: 10, 25, 50 and 100 appears above the table, defaulting to ten sales. All has been removed: the page no longer makes unbounded history requests. Each sale stays grouped with its items. Changing row size resets to page one, while every matching transaction remains reachable through pagination. Quantity and monetary totals still cover every matching page. API/export consumers retain their existing bounded pagination.


The Records period menu no longer includes Custom Range. FROM and TO remain directly editable; manual edits display Manual dates and stop preset rollover. Daily, Weekly, Monthly, Yearly and All Time remain available.
