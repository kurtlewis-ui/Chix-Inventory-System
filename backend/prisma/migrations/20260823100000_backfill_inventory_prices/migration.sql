-- Backfill: Copy product.selling_price to all inventory rows that have NULL selling_price.
-- This ensures every branch has its own selling price (direct pricing, no override logic).
UPDATE inventory
SET selling_price = p.selling_price
FROM products p
WHERE inventory.product_id = p.id
  AND inventory.selling_price IS NULL;
