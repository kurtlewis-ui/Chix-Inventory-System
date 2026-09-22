-- ---------------------------------------------------------------------------
-- One-time manual fix: move "8055 Pods" to the BOTTOM of the products list.
-- ---------------------------------------------------------------------------
-- Use this ONLY if you want the fix applied immediately, before the
-- 20260906000000_add_product_sort_order migration runs. If that migration has
-- already been applied, 8055 Pods is already at the bottom and you can skip
-- this file entirely.
--
-- How to run: paste into the Neon SQL editor (or `psql`) connected to your
-- database, and execute.
--
-- Safe to run more than once (idempotent): each run just re-pins 8055 Pods to
-- one past the current maximum sort_order.
--
-- REQUIRES the "sort_order" column to already exist (added by the migration).
-- If the column does not exist yet, run the migration first — do NOT add the
-- column by hand, or Prisma's migration history will drift.

UPDATE "products"
SET "sort_order" = (SELECT COALESCE(MAX("sort_order"), 0) + 1 FROM "products")
WHERE LOWER("name") = LOWER('8055 Pods')
  AND "deleted_at" IS NULL;

-- Verify the new order (8055 Pods should be the last row):
--   SELECT name, sort_order FROM "products" WHERE deleted_at IS NULL ORDER BY sort_order ASC;
