-- CreateTable
CREATE TABLE "disposals" (
    "id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "product_id" UUID,
    "product_name" VARCHAR(150) NOT NULL,
    "brand_name" VARCHAR(100) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "disposals_branch_id_idx" ON "disposals"("branch_id");

-- CreateIndex
CREATE INDEX "disposals_product_id_idx" ON "disposals"("product_id");

-- CreateIndex
CREATE INDEX "disposals_created_at_idx" ON "disposals"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "disposals" ADD CONSTRAINT "disposals_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disposals" ADD CONSTRAINT "disposals_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disposals" ADD CONSTRAINT "disposals_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
