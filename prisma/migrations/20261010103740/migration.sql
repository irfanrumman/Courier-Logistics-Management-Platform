-- AlterTable
ALTER TABLE "shipments" ADD COLUMN     "pickupCourierManId" TEXT;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_pickupCourierManId_fkey" FOREIGN KEY ("pickupCourierManId") REFERENCES "courierMans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
