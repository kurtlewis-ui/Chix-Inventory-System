-- Per-branch brand archive.
-- Records which (brand, branch) pairs are archived: the brand is "removed" from
-- that ONE branch (hidden + its products unsellable there) while staying active
-- in every other branch. A row present = archived in that branch; no row =
-- active (the default for everything, so this migration is safe/additive).
-- Independent of brands.deleted_at (global brand archive) and
-- inventory.archived_at (per-branch product archive).
CREATE TABLE "branch_brand_archives" (
    "id" UUID NOT NULL,
    "brand_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "archived_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_brand_archives_pkey" PRIMARY KEY ("id")
);

-- One archive row per (brand, branch).
CREATE UNIQUE INDEX "branch_brand_archives_brand_id_branch_id_key" ON "branch_brand_archives"("brand_id", "branch_id");

-- Fast "archived brands for a branch" lookups.
CREATE INDEX "branch_brand_archives_branch_id_idx" ON "branch_brand_archives"("branch_id");

ALTER TABLE "branch_brand_archives" ADD CONSTRAINT "branch_brand_archives_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branch_brand_archives" ADD CONSTRAINT "branch_brand_archives_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
