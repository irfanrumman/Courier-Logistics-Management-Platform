/*
  Warnings:

  - You are about to drop the column `defaultPickupAddressLine` on the `merchant_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `defaultPickupDistrict` on the `merchant_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `defaultPickupPostalCode` on the `merchant_profiles` table. All the data in the column will be lost.
  - You are about to drop the column `defaultPickupThana` on the `merchant_profiles` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[nidNumber]` on the table `merchant_profiles` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tinNumber]` on the table `merchant_profiles` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `nidBackImagePublicId` to the `merchant_profiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nidBackImageUrl` to the `merchant_profiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nidFrontImagePublicId` to the `merchant_profiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nidFrontImageUrl` to the `merchant_profiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nidNumber` to the `merchant_profiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tinImagePublicId` to the `merchant_profiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tinImageUrl` to the `merchant_profiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tinNumber` to the `merchant_profiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tradeLicenseImagePublicId` to the `merchant_profiles` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tradeLicenseImageUrl` to the `merchant_profiles` table without a default value. This is not possible if the table is not empty.
  - Made the column `tradeLicenseNumber` on table `merchant_profiles` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "MerchantStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "merchant_profiles" DROP COLUMN "defaultPickupAddressLine",
DROP COLUMN "defaultPickupDistrict",
DROP COLUMN "defaultPickupPostalCode",
DROP COLUMN "defaultPickupThana",
ADD COLUMN     "PickupAddressLine" TEXT,
ADD COLUMN     "PickupDistrict" TEXT,
ADD COLUMN     "PickupPostalCode" TEXT,
ADD COLUMN     "PickupThana" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nidBackImagePublicId" TEXT NOT NULL,
ADD COLUMN     "nidBackImageUrl" TEXT NOT NULL,
ADD COLUMN     "nidFrontImagePublicId" TEXT NOT NULL,
ADD COLUMN     "nidFrontImageUrl" TEXT NOT NULL,
ADD COLUMN     "nidNumber" TEXT NOT NULL,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "shopImagePublicId" TEXT,
ADD COLUMN     "shopImageUrl" TEXT,
ADD COLUMN     "status" "MerchantStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "tinImagePublicId" TEXT NOT NULL,
ADD COLUMN     "tinImageUrl" TEXT NOT NULL,
ADD COLUMN     "tinNumber" TEXT NOT NULL,
ADD COLUMN     "tradeLicenseImagePublicId" TEXT NOT NULL,
ADD COLUMN     "tradeLicenseImageUrl" TEXT NOT NULL,
ALTER COLUMN "tradeLicenseNumber" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "merchant_profiles_nidNumber_key" ON "merchant_profiles"("nidNumber");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_profiles_tinNumber_key" ON "merchant_profiles"("tinNumber");
