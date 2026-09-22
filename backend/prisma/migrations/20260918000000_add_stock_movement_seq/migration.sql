-- Add a monotonic insertion counter (`seq`) to stock_movements so the history
-- can be ordered deterministically. Rows written in the SAME transaction (a
-- multi-item sale) share one now() `created_at`, so ordering by created_at
-- alone left them in arbitrary order — making the running "Remaining Quantity"
-- look scrambled. `seq` is a database sequence assigned in true insertion
-- order, giving an exact, stable ordering even for same-timestamp rows.
--
-- IMPORTANT — ordering of EXISTING rows:
-- We must not let Postgres assign seq values to existing rows in arbitrary
-- physical order. So we: (1) add the column nullable with no default,
-- (2) backfill it explicitly ordered by (created_at, id) — the best available
-- proxy for original insertion order, (3) attach a sequence as the default and
-- advance it past the current max, (4) make it NOT NULL. New inserts then get
-- the next sequence value automatically.

-- 1) Add the column (nullable for now).
ALTER TABLE "stock_movements" ADD COLUMN "seq" BIGINT;

-- 2) Backfill existing rows in a sensible, stable order.
WITH ordered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at" ASC, "id" ASC) AS rn
  FROM "stock_movements"
)
UPDATE "stock_movements" sm
SET "seq" = ordered.rn
FROM ordered
WHERE sm."id" = ordered."id";

-- 3) Create the sequence, own it to the column, and set it to continue past the
--    current maximum so new rows never collide with backfilled values.
CREATE SEQUENCE "stock_movements_seq_seq" AS BIGINT OWNED BY "stock_movements"."seq";
SELECT setval(
  'stock_movements_seq_seq',
  COALESCE((SELECT MAX("seq") FROM "stock_movements"), 0) + 1,
  false
);
ALTER TABLE "stock_movements"
  ALTER COLUMN "seq" SET DEFAULT nextval('stock_movements_seq_seq');

-- 4) Enforce NOT NULL now that every row has a value and new rows get a default.
ALTER TABLE "stock_movements" ALTER COLUMN "seq" SET NOT NULL;

-- 5) Index matching the history query (product + branch, newest seq first).
CREATE INDEX "stock_movements_product_id_branch_id_seq_idx"
  ON "stock_movements" ("product_id", "branch_id", "seq" DESC);
