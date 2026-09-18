-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN     "followUpContacted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "followUpDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Consultation_followUpDate_idx" ON "Consultation"("followUpDate");
