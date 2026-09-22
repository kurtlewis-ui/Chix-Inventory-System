-- Composite index matching the app's hottest read pattern on sales:
-- "pending sales for a given branch, newest first" — i.e. filter on
-- branch_id + status and order by created_at DESC (the Pending Sales page).
--
-- The table already has separate single-column indexes on branch_id, status,
-- and created_at, but Postgres can only fully use one per query. A single
-- composite index ordered (branch_id, status, created_at DESC) lets the
-- planner satisfy the filter AND the ordering from one index, which matters
-- much more as the number of branches (and total sales rows) grows.
CREATE INDEX "sales_branch_id_status_created_at_idx"
  ON "sales" ("branch_id", "status", "created_at" DESC);
