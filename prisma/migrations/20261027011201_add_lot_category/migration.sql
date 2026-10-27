-- CreateEnum
CREATE TYPE "LotCategory" AS ENUM ('FINE_ART', 'JEWELRY', 'WATCHES', 'ANTIQUITIES', 'NUMISMATICS', 'FASHION', 'VEHICLES', 'BOOKS', 'WINE', 'OTHER');

-- DropIndex
DROP INDEX "Lot_title_trgm_idx";

-- AlterTable
ALTER TABLE "Lot" ADD COLUMN     "lotCategory" "LotCategory" NOT NULL DEFAULT 'OTHER';

-- CreateIndex
CREATE INDEX "Lot_lotCategory_status_idx" ON "Lot"("lotCategory", "status");
