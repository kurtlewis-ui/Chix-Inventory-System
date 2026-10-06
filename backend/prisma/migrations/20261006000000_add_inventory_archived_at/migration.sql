-- Per-branch product archive.
-- Adds a nullable `archived_at` to the inventory (per-branch stock) row.
-- NULL = the product is active in that branch (the default for all existing
-- rows, so this migration is safe/additive). A timestamp = the product is
-- "removed" from THAT branch only (hidden + not sellable there), while staying
-- active in every other branch. The quantity is kept so a restore brings the
-- branch's stock back exactly. This is independent of products.deleted_at,
-- which archives a product globally across all branches.
ALTER TABLE "inventory" ADD COLUMN "archived_at" TIMESTAMP(6);

-- Supports the hot query "active (or archived) products for a given branch".
CREATE INDEX "inventory_branch_id_archived_at_idx" ON "inventory"("branch_id", "archived_at");
