/*
  Warnings:

  - You are about to drop the column `PickupAddressLine` on the `merchant_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `PickupDistrict` on the `merchant_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `PickupPostalCode` on the `merchant_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `PickupThana` on the `merchant_profiles` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "merchant_profiles" DROP COLUMN "PickupAddressLine",
DROP COLUMN "PickupDistrict",
DROP COLUMN "PickupPostalCode",
DROP COLUMN "PickupThana",
ADD COLUMN     "pickupAddressLine" TEXT,
ADD COLUMN     "pickupDistrict" TEXT,
ADD COLUMN     "pickupPostalCode" TEXT,
ADD COLUMN     "pickupThana" TEXT;
