-- CreateEnum
CREATE TYPE "ShiftStatusForHubManager" AS ENUM ('MORNING', 'EVENING', 'NIGHT');

-- DropIndex
DROP INDEX "hub_managers_hubId_key";

-- AlterTable
ALTER TABLE "hub_managers" ADD COLUMN     "shift" "ShiftStatusForHubManager";
