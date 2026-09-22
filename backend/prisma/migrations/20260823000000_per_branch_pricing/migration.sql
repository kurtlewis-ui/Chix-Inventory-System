-- AlterTable: Add per-branch selling price override to inventory
ALTER TABLE "inventory" ADD COLUMN "selling_price" DECIMAL(10,2);
