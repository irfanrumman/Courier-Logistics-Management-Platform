-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "defaultAddressLine" TEXT,
ADD COLUMN     "defaultDistrict" TEXT,
ADD COLUMN     "defaultPostalCode" TEXT,
ADD COLUMN     "defaultThana" TEXT;

-- AlterTable
ALTER TABLE "parcels" ADD COLUMN     "parcelImagePublicId" TEXT,
ADD COLUMN     "parcelImageUrl" TEXT;
