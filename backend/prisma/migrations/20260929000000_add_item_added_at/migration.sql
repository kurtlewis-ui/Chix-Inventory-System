-- Per-item "added to draft" time.
--
-- A staff member adds items to their draft cart at different times, then
-- submits the whole draft in one save. Previously every resulting row shared
-- the single submit time (createdAt). These nullable columns preserve the
-- ORIGINAL time each line/record was added to the draft.
--
-- Nullable so all existing rows (and any record created outside the draft
-- flow) stay valid; the app falls back to createdAt for display when null.

ALTER TABLE "sale_items" ADD COLUMN "added_at" TIMESTAMP(6);
ALTER TABLE "disposals" ADD COLUMN "added_at" TIMESTAMP(6);
ALTER TABLE "expenses" ADD COLUMN "added_at" TIMESTAMP(6);
