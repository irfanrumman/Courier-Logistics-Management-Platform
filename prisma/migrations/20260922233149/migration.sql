-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "deliveryAttemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "returnedAt" TIMESTAMP(3);
