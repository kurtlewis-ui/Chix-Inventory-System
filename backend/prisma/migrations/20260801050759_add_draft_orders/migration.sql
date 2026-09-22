-- CreateTable
CREATE TABLE "draft_orders" (
    "id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "payment_method" "payment_method" NOT NULL DEFAULT 'Cash',
    "customer_name" VARCHAR(150),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "draft_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "draft_orders_staff_id_key" ON "draft_orders"("staff_id");

-- CreateIndex
CREATE INDEX "draft_orders_branch_id_idx" ON "draft_orders"("branch_id");

-- AddForeignKey
ALTER TABLE "draft_orders" ADD CONSTRAINT "draft_orders_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_orders" ADD CONSTRAINT "draft_orders_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
