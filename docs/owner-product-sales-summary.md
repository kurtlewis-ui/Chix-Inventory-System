# Owner product reports

The Owner dashboard's Top Selling Products section is now Product Sales Summary. Its chart shows the top ten by units sold; the table includes every product with approved sales matching the filters, using server pagination. Products without approved activity are excluded. Most Disposed Products uses the same reporting interface for approved disposals.

Each section independently supports Daily/Today, Weekly/This Week, Monthly/This Month, Yearly/This Year, All Time and custom dates, plus a branch and product/brand search. Clicking a product name selects that exact product identity. Totals and top-ten rankings cover all matches, regardless of table page. The existing Chix Philippine midnight-to-midnight calendar is unchanged. Presets advance at cutoff without a polling interval; custom dates stay fixed.

Sales Revenue is the sum of stored line subtotals after discounts. Total Capital is the sum of each sale line's saved unit cost multiplied by its quantity. For example, ten units sold with a saved cost of 100 and five with a saved cost of 120 produce capital of 1,600. Editing the current product cost does not rewrite those historical values. This is sale-time snapshot costing, not FIFO or batch costing. Existing zero-cost snapshots remain zero; no historical costs are inferred or backfilled.

The report groups stable product IDs across renames, using the latest matching historical name/brand as the label. If a deleted product has no remaining ID, its stored name/brand form a historical fallback identity. Pending and declined activity is excluded. Date filters use the sale/disposal creation date, matching the existing financial reports. Disposal loss uses the stored disposal value.

Both report endpoints are Owner-only. Aggregation, all-match totals, chart ranking and table pagination happen in one parameterized SQL query/snapshot. The browser receives only the current page, ten chart rows and totals. It no longer downloads disposal records and adds only the first page locally. No production database migration or new runtime dependency is required.

Validation: backend/frontend builds; the backend test suite including query validation and role boundaries; PostgreSQL fixture tests covering historical costs, discounts, product identity, branch/search/date filters, pagination, deleted products, literal search text and more than 200 disposal records; browser checks in light/dark at 320/390/768/1440 pixels, including Admin/Staff exclusions. No live business data was modified.

The optional PostgreSQL test suite uses a separately installed `@electric-sql/pglite`. Set `PGLITE_TEST_MODULE` to that module path and include `--experimental-vm-modules` in `NODE_OPTIONS`, then run `npm --prefix backend test -- --runInBand product-report`. Without that test-only module, the six PostgreSQL integration cases are explicitly skipped; the remaining tests still run normally.
