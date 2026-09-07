/*
  Warnings:

  - The values [MARCHANT] on the enum `CustomerType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "CustomerType_new" AS ENUM ('INDIVIDUAL', 'MERCHANT');
ALTER TABLE "public"."customers" ALTER COLUMN "customerType" DROP DEFAULT;
ALTER TABLE "customers" ALTER COLUMN "customerType" TYPE "CustomerType_new" USING ("customerType"::text::"CustomerType_new");
ALTER TYPE "CustomerType" RENAME TO "CustomerType_old";
ALTER TYPE "CustomerType_new" RENAME TO "CustomerType";
DROP TYPE "public"."CustomerType_old";
ALTER TABLE "customers" ALTER COLUMN "customerType" SET DEFAULT 'INDIVIDUAL';
COMMIT;
