/*
  Warnings:

  - The values [LAST_MILE] on the enum `CourierManAssignType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "CourierManAssignType_new" AS ENUM ('PICKUP_TO_HUB', 'HUB_TRANSFER', 'DELIVERY_TO_RECEIVER');
ALTER TYPE "CourierManAssignType" RENAME TO "CourierManAssignType_old";
ALTER TYPE "CourierManAssignType_new" RENAME TO "CourierManAssignType";
DROP TYPE "public"."CourierManAssignType_old";
COMMIT;
