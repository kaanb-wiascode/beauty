-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('COMPLETED', 'REFUNDED');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "refundReason" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMP(3),
ADD COLUMN     "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED';

-- CreateIndex
CREATE INDEX "payments_tenantId_status_idx" ON "payments"("tenantId", "status");
