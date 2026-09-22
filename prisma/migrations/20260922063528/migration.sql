/*
  Warnings:

  - You are about to drop the column `customerType` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `email` on the `customers` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `customers` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'MERCHANT';

-- DropIndex
DROP INDEX "customers_email_key";

-- AlterTable
ALTER TABLE "customers" DROP COLUMN "customerType",
DROP COLUMN "email",
DROP COLUMN "name";

-- DropEnum
DROP TYPE "CustomerType";
