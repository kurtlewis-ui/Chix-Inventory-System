/*
  Warnings:

  - You are about to drop the column `bank_note` on the `draft_orders` table. All the data in the column will be lost.
  - You are about to drop the column `payment_method` on the `draft_orders` table. All the data in the column will be lost.
  - You are about to drop the column `bank_note` on the `sales` table. All the data in the column will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "payment_method" ADD VALUE 'Cashless';
ALTER TYPE "payment_method" ADD VALUE 'Split';
ALTER TYPE "payment_method" ADD VALUE 'Mixed';

-- AlterTable
ALTER TABLE "draft_orders" DROP COLUMN "bank_note",
DROP COLUMN "payment_method";

-- AlterTable
ALTER TABLE "sale_items" ADD COLUMN     "bank_note" VARCHAR(100),
ADD COLUMN     "note" VARCHAR(255),
ADD COLUMN     "payment_method" "payment_method" NOT NULL DEFAULT 'Cash',
ADD COLUMN     "payment_split" JSONB;

-- AlterTable
ALTER TABLE "sales" DROP COLUMN "bank_note";
