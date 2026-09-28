/*
  Warnings:

  - You are about to drop the column `courierType` on the `courierMans` table. All the data in the column will be lost.
  - Added the required column `courierManAssignType` to the `courierMans` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CourierManAssignType" AS ENUM ('HUB_TRANSFER', 'LAST_MILE');

-- AlterTable
ALTER TABLE "courierMans" DROP COLUMN "courierType",
ADD COLUMN     "courierManAssignType" "CourierManAssignType" NOT NULL;

-- DropEnum
DROP TYPE "CourierType";
