-- Add cost_price to products table (confidential, Owner-only)
ALTER TABLE "products" ADD COLUMN "cost_price" DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- Add cost_price to sale_items (snapshot at time of sale for profit calculations)
ALTER TABLE "sale_items" ADD COLUMN "cost_price" DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- Create stock_movement_type enum
CREATE TYPE "stock_movement_type" AS ENUM ('SALE', 'RESTOCK', 'DISPOSAL', 'RETURN', 'ADJUSTMENT');

-- Create stock_movements table
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "user_id" UUID,
    "type" "stock_movement_type" NOT NULL,
    "quantity_change" INTEGER NOT NULL,
    "quantity_after" INTEGER NOT NULL,
    "description" VARCHAR(255),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE INDEX "stock_movements_product_id_branch_id_created_at_idx" ON "stock_movements"("product_id", "branch_id", "created_at" DESC);
CREATE INDEX "stock_movements_branch_id_idx" ON "stock_movements"("branch_id");
CREATE INDEX "stock_movements_user_id_idx" ON "stock_movements"("user_id");
CREATE INDEX "stock_movements_created_at_idx" ON "stock_movements"("created_at" DESC);

-- Add foreign keys
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
