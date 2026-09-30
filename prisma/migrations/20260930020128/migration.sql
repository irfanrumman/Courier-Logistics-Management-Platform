-- AlterTable
ALTER TABLE "cod_collections" ADD COLUMN     "receivedByHubManagerId" TEXT,
ADD COLUMN     "submittedToHubAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "cod_collections" ADD CONSTRAINT "cod_collections_receivedByHubManagerId_fkey" FOREIGN KEY ("receivedByHubManagerId") REFERENCES "hub_managers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
