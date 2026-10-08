-- ============================================================================
-- ONE-OFF CLEANUP: Delete APPROVED sales + staff DRAFTS for Oct 9, 2026
-- ============================================================================
--
--  WHAT THIS DOES
--    1. Permanently DELETES every APPROVED sale created on October 9, 2026
--       (Philippine local time, Asia/Manila = UTC+8), along with its sale
--       items (auto-removed via ON DELETE CASCADE on sale_items.sale_id).
--    2. Permanently DELETES every staff saved DRAFT (draft_orders) created on
--       the same day. Draft line items / disposals / expenses live in JSONB
--       columns on the same row, so deleting the row removes them too.
--
--    Result: the dashboard and the sales / drafts lists (Admin, Owner, Staff)
--    all read 0 for Oct 9, 2026.
--
--  !!!  WARNING — THIS IS DESTRUCTIVE AND IRREVERSIBLE  !!!
--    There is no undo. Run the PREVIEW section first, confirm the counts and
--    rows match what you expect, and only then run the TRANSACTION section.
--    Take a database backup/snapshot before running in production.
--
--  SCOPE NOTES
--    * Only sales with status = 'APPROVED' are deleted. PENDING / DECLINED
--      sales for the day are left untouched.
--    * ALL staff drafts for the day are deleted (drafts have no status field).
--    * Stock movements (stock_movements) are NOT touched — the user will fix
--      stock quantities manually. They have no FK to sales, so they neither
--      block nor get removed by this script.
--    * daily_sale_counters are intentionally left alone (harmless; the day's
--      per-branch sale numbering simply won't reset to 1).
--
--  TIMEZONE / DATE RANGE
--    Target local day : 2026-10-09, Asia/Manila (UTC+8)
--    Equivalent UTC   : >= 2026-10-08 16:00:00+00  AND  < 2026-10-09 16:00:00+00
--    created_at is stored in UTC (Prisma @db.Timestamp). The predicates below
--    use the timezone-safe form (created_at AT TIME ZONE 'Asia/Manila')::date
--    = DATE '2026-10-09', which is equivalent to the UTC range above.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- STEP 1 — PREVIEW (read-only). RUN THIS FIRST. Deletes nothing.
--          Confirm the counts and rows look correct before proceeding.
-- ----------------------------------------------------------------------------

-- 1a. How many APPROVED sales will be deleted for Oct 9 (Manila)?
SELECT COUNT(*) AS approved_sales_to_delete
FROM sales
WHERE status = 'APPROVED'
  AND (created_at AT TIME ZONE 'Asia/Manila')::date = DATE '2026-10-09';

-- 1b. The actual APPROVED sales rows (review these).
SELECT id, number, branch_id, staff_id, status, total, created_at,
       (created_at AT TIME ZONE 'Asia/Manila') AS created_at_manila
FROM sales
WHERE status = 'APPROVED'
  AND (created_at AT TIME ZONE 'Asia/Manila')::date = DATE '2026-10-09'
ORDER BY created_at;

-- 1c. How many staff drafts will be deleted for Oct 9 (Manila)?
SELECT COUNT(*) AS drafts_to_delete
FROM draft_orders
WHERE (created_at AT TIME ZONE 'Asia/Manila')::date = DATE '2026-10-09';

-- 1d. The actual draft rows (review these).
SELECT id, staff_id, branch_id, customer_name, created_at,
       (created_at AT TIME ZONE 'Asia/Manila') AS created_at_manila
FROM draft_orders
WHERE (created_at AT TIME ZONE 'Asia/Manila')::date = DATE '2026-10-09'
ORDER BY created_at;


-- ----------------------------------------------------------------------------
-- STEP 2 — DELETE (destructive). Run only after verifying STEP 1.
--          Wrapped in a transaction. To test without committing, change the
--          final COMMIT to ROLLBACK (the counts above will still show, then
--          roll back). Replace back to COMMIT to apply for real.
-- ----------------------------------------------------------------------------

BEGIN;

-- 2a. Delete APPROVED sales for Oct 9 (Manila).
--     sale_items are removed automatically via ON DELETE CASCADE on
--     sale_items.sale_id, so no separate child delete is needed.
DELETE FROM sales
WHERE status = 'APPROVED'
  AND (created_at AT TIME ZONE 'Asia/Manila')::date = DATE '2026-10-09';

-- 2b. Delete staff drafts for Oct 9 (Manila).
--     Draft items/disposals/expenses are JSONB columns on this row, removed
--     with it. No child tables.
DELETE FROM draft_orders
WHERE (created_at AT TIME ZONE 'Asia/Manila')::date = DATE '2026-10-09';

-- 2c. (Optional) Re-run the preview counts here; both should return 0.
--     SELECT COUNT(*) FROM sales
--       WHERE status = 'APPROVED'
--         AND (created_at AT TIME ZONE 'Asia/Manila')::date = DATE '2026-10-09';
--     SELECT COUNT(*) FROM draft_orders
--       WHERE (created_at AT TIME ZONE 'Asia/Manila')::date = DATE '2026-10-09';

COMMIT;
-- COMMIT applies the deletes. Use ROLLBACK instead to abort/test.
