-- Remove the "Cashless" payment method entirely.
--
-- Cashless was only ever produced as the silent leftover of a Split payment
-- (subTotal − cash − gcash − bankTransfer); it was never directly selectable.
-- We now require a Split to fully allocate to Cash + Gcash + Bank Transfer, so
-- Cashless is dropped from the data model.
--
-- This migration is written to be SAFE even if legacy data used Cashless:
--   1. Backfill any Sale rows whose rollup paymentMethod = 'Cashless' -> 'Cash'.
--   2. Fold any nonzero paymentSplit.cashless amount into the cash bucket and
--      drop the cashless key (totals are unchanged — the money was always
--      counted; it just stops being labelled "Cashless").
--   3. Recreate the payment_method enum WITHOUT 'Cashless'.

-- 1. Reassign any sale-level rollup that somehow landed on Cashless.
UPDATE "sales" SET "payment_method" = 'Cash' WHERE "payment_method" = 'Cashless';

-- 2. Fold paymentSplit.cashless into cash, then remove the cashless key, for
--    any sale item that has a split with a nonzero cashless remainder.
UPDATE "sale_items"
SET "payment_split" =
  (("payment_split" - 'cashless')
    || jsonb_build_object(
         'cash',
         COALESCE(("payment_split"->>'cash')::numeric, 0)
           + COALESCE(("payment_split"->>'cashless')::numeric, 0)
       ))
WHERE "payment_split" IS NOT NULL
  AND "payment_split" ? 'cashless';

-- 3. Recreate the enum without 'Cashless'.
--    (Postgres can't drop a value in place, so swap the type.)
ALTER TYPE "payment_method" RENAME TO "payment_method_old";

CREATE TYPE "payment_method" AS ENUM ('Cash', 'Gcash', 'BankTransfer', 'Split', 'Mixed');

-- Drop the column default before the type swap, then restore it after.
ALTER TABLE "sales" ALTER COLUMN "payment_method" DROP DEFAULT;
ALTER TABLE "sale_items" ALTER COLUMN "payment_method" DROP DEFAULT;

ALTER TABLE "sales"
  ALTER COLUMN "payment_method" TYPE "payment_method"
  USING ("payment_method"::text::"payment_method");
ALTER TABLE "sale_items"
  ALTER COLUMN "payment_method" TYPE "payment_method"
  USING ("payment_method"::text::"payment_method");

ALTER TABLE "sales" ALTER COLUMN "payment_method" SET DEFAULT 'Cash';
ALTER TABLE "sale_items" ALTER COLUMN "payment_method" SET DEFAULT 'Cash';

DROP TYPE "payment_method_old";
