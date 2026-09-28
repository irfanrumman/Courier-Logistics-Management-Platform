/*
  Warnings:

  - You are about to drop the column `paymentType` on the `shipments` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[gatewayReferenceId]` on the table `payments` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "shipments" DROP COLUMN "paymentType";

-- DropEnum
DROP TYPE "ShipmentPaymentType";

-- CreateIndex
CREATE UNIQUE INDEX "payments_gatewayReferenceId_key" ON "payments"("gatewayReferenceId");
