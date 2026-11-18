# Chix report efficiency audit

Scope: Chix only. No production database, Render metrics, or Supabase usage dashboard was accessed. These changes reduce identifiable repeated work; they do not guarantee a particular bill or quota usage.

## Changes

- Sales Records and Owner approved Disposal Records reuse full-filter totals for up to 45 seconds while requesting bounded pages. The cache includes account, role, branch assignment, and every report filter. Pagination and row size do not change the totals scope.
- The first request returns rows, count, and summary. Subsequent requests in that fresh scope use `totals=omit`, so the backend skips the count and full-history aggregate and returns only rows. There is still one HTTP request per requested page, with no extra summary endpoint. Normal API callers retain the complete response by default.
- Page freshness cannot outlive the totals it reused. Sales/disposal mutation invalidations also invalidate their totals cache. Aborted requests cannot populate it. Another browser/account's changes can remain unseen until an ordinary refetch; no realtime subscription or polling has been added.
- Historical product selectors use `DISTINCT ON` for latest names instead of building sorted arrays of every matching historical name. Exact-product dashboard reports restrict the source before aggregation and use the existing product ID index where applicable.
- Sale reads select serializer-used item fields rather than transferring unused cost snapshots and sale IDs from PostgreSQL to Node. Historical cost writes and capital/loss calculations are unchanged.
- Canceled requests are not retried. Automatic transient retries apply only to GET/HEAD, not writes. Read cold-start retries remain bounded, and React Query does not repeat an already exhausted Axios retry chain. Normal authentication refresh remains available.
- Heartbeat refreshes only visible, online sessions at the existing ten-minute cadence. It no longer sends a separate redundant health ping or restarts its timer on each token rotation. A tab hidden beyond the server session's idle timeout may need to log in again; hiding a tab no longer keeps that session active indefinitely.

## Existing controls retained

- Records row choices remain 10, 25, 50, and 100, without unbounded All mode.
- Report search remains debounced; historical product options load in pages when needed.
- Reports/dashboard have no periodic polling, and global focus refetch remains disabled. Existing live Pending-page refresh intervals and visibility/offline gates are unchanged.
- Response compression and existing product/branch/status/date indexes remain in place. No migration, new index, shared server financial cache, external cache service, or new runtime dependency is required.

## Local validation

- Backend: 14 suites / 133 tests passed, including omission guards, bounded/scoped reads, saved-cost reports, and existing authorization behavior. Backend build and frontend production build passed.
- `npm --prefix frontend run check:efficiency`: real QueryClient/cache and Axios interceptor tests plus heartbeat lifecycle checks. Covers expiry, mutation invalidation, account/filter isolation, cancellation, retry bounds, writes, and token rotation.
- Browser regression: six Sales Records flows (Owner/Admin, light/dark, desktop/mobile), six Owner Disposal Records flows (320/390/1440px, light/dark), and Admin disposal-page redirect. Each paginated report fixture contains 235 approved records across 24 pages. Checks include row sizes, end-of-list bounds, exact/historical products, dates, totals, and no overflow or browser errors.
- Browser clock: idle reports made no periodic requests; hidden/offline heartbeat ticks made no refresh calls; visible online ticks retained refresh without health pings or extra intervals after token rotation.

For 24 pages within one fresh, unchanged scope, the tests observed one full totals request and 23 row-only requests. Top-level report operations drop from 24 page queries + 24 counts + 24 aggregates (72) to 24 page queries + one count + one aggregate (26). This is about 64% fewer such operations, **not** a claim of 64% lower overall CPU or egress; authentication and relation queries are excluded.

Local synthetic PostgreSQL (PGlite), 50,000 source rows, five alternating warm runs per query, median durations:

| Query | Before | After | Result equality |
| --- | ---: | ---: | --- |
| Sales historical product choices | 139.92 ms | 128.73 ms | Equal |
| Disposal historical product choices | 108.03 ms | 99.87 ms | Equal |
| All-product sales report | 179.64 ms | 154.06 ms | Equal |
| Exact-product sales report | 126.64 ms | 4.96 ms | Equal |

These fixtures demonstrate correctness and reduced work locally; production plans, latency, cache hit rates, traffic, and resource usage can differ. An attempted broader aggregation rewrite regressed the all-product fixture and was discarded. Monitor real Render CPU/runtime and database/egress after deployment before drawing quota conclusions. Image bandwidth and the size of imported historical data still depend on actual usage.
