# Chix Sales Records

Sales Records opens on All Shops and All Time independently of the shared branch selection elsewhere. Filter order is SHOPS, PERIOD, FROM, TO with neutral icons. Periods include Daily/Today, Weekly/This Week, Monthly/This Month, Yearly/This Year, All Time and Custom Range. Chix retains its midnight-to-midnight Philippine calendar, Monday weeks and one cutoff timer for presets; there is no new polling interval. Custom ranges require both dates and reject reversed ranges. Clear Filter restores the initial state.

The page requests ten sales at a time from the records endpoint and uses the server's complete matching count/page metadata. It no longer pages only the first 200 downloaded sales. Ordering uses createdAt then id to make tied timestamps stable. Each sale stays together, with its own item rows and total. Navigation is disabled while fetching or waiting for search debounce.

Records product/brand search runs before server pagination and count, so matches beyond the former 200-sale boundary remain accessible. The visible sale contains only matching item rows, with a matching visible total. The payment summary sums matching item rows across all result pages, including discounts and split payments. Percent/underscore characters are literal in Records search. Pending Sales keeps its existing broader search behavior. Staff branch restrictions remain server-enforced.

No migration or live data changes. Validation uses service pagination/role tests, PostgreSQL payment-summary fixtures and mocked browser flows for more than 200 records, rare-product search, presets/custom dates, default filters, mobile and light/dark layouts.
