-- CreateEnum
CREATE TYPE "disposal_status" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- AlterTable
ALTER TABLE "disposals" ADD COLUMN     "decided_at" TIMESTAMP(6),
ADD COLUMN     "decided_by_id" UUID,
ADD COLUMN     "status" "disposal_status" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "disposals_status_idx" ON "disposals"("status");

-- AddForeignKey
ALTER TABLE "disposals" ADD CONSTRAINT "disposals_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
