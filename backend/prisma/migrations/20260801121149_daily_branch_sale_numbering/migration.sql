-- DropIndex
DROP INDEX "sales_number_key";

-- AlterTable
ALTER TABLE "sales" ALTER COLUMN "number" SET DEFAULT 0,
ALTER COLUMN "number" DROP DEFAULT;
DROP SEQUENCE "sales_number_seq";

-- CreateTable
CREATE TABLE "daily_sale_counters" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_sale_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_sale_counters_branch_id_date_key" ON "daily_sale_counters"("branch_id", "date");
