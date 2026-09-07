/*
  Warnings:

  - You are about to drop the column `weightKg` on the `shipments` table. All the data in the column will be lost.
  - Added the required column `totalWeightKg` to the `shipments` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "shipments" DROP COLUMN "weightKg",
ADD COLUMN     "totalWeightKg" DECIMAL(8,2) NOT NULL;

-- CreateTable
CREATE TABLE "parcels" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "weightKg" DECIMAL(8,2) NOT NULL,
    "declaredValue" DECIMAL(10,2),
    "isFragile" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parcels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_parcel_shipmentId" ON "parcels"("shipmentId");

-- AddForeignKey
ALTER TABLE "parcels" ADD CONSTRAINT "parcels_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
