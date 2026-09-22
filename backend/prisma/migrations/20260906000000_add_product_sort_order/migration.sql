-- Add a manual display-order column to products.
-- New rows default to 0; the application overwrites that with (max + 1) on
-- create so newly added products land at the bottom of the list.
ALTER TABLE "products" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

-- Backfill existing products so the current on-screen order (oldest first,
-- by created_at) is preserved as an explicit sort_order (0,1,2,...). Ordering
-- is scoped to the whole table; ties broken by id for determinism.
WITH ordered AS (
  SELECT
    id,
    (ROW_NUMBER() OVER (ORDER BY "created_at" ASC, "id" ASC) - 1) AS rn
  FROM "products"
)
UPDATE "products" p
SET "sort_order" = ordered.rn
FROM ordered
WHERE p.id = ordered.id;

-- One-time data fix: move "8055 Pods" to the end of the list (treat it as the
-- most recently (re)added product) by giving it a sort_order just past the
-- current maximum. Case-insensitive match; no-op if the product doesn't exist.
UPDATE "products"
SET "sort_order" = (SELECT COALESCE(MAX("sort_order"), 0) + 1 FROM "products")
WHERE LOWER("name") = LOWER('8055 Pods')
  AND "deleted_at" IS NULL;

-- Helps ORDER BY sort_order on list queries.
CREATE INDEX "products_sort_order_idx" ON "products" ("sort_order");
