-- AlterTable
ALTER TABLE "LabResultItem" ADD COLUMN     "substitutedFor" TEXT;

-- AlterTable
ALTER TABLE "LabTestOrder" ADD COLUMN     "skipReason" TEXT,
ADD COLUMN     "skippedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PharmacyItem" ADD COLUMN     "strength" TEXT;

-- AlterTable
ALTER TABLE "PharmacySaleItem" ADD COLUMN     "substitutedFor" TEXT;

-- AlterTable
ALTER TABLE "Prescription" ADD COLUMN     "skipReason" TEXT,
ADD COLUMN     "skippedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "RadiologyResultItem" ADD COLUMN     "substitutedFor" TEXT;

-- AlterTable
ALTER TABLE "RadiologyTestOrder" ADD COLUMN     "skipReason" TEXT,
ADD COLUMN     "skippedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "LabResultItem_orderId_idx" ON "LabResultItem"("orderId");

-- CreateIndex
CREATE INDEX "PharmacySaleItem_prescriptionId_idx" ON "PharmacySaleItem"("prescriptionId");

-- CreateIndex
CREATE INDEX "RadiologyResultItem_orderId_idx" ON "RadiologyResultItem"("orderId");

