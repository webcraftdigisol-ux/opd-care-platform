-- CreateEnum
CREATE TYPE "CatalogKind" AS ENUM ('MEDICINE', 'LAB_TEST', 'RADIOLOGY');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'VISIT_SUMMARY_SHARED';

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "address" TEXT,
ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN     "chiefComplaint" TEXT,
ADD COLUMN     "differentialDiagnosis" TEXT,
ADD COLUMN     "doctorNotes" TEXT,
ADD COLUMN     "followUpDayReminderSentAt" TIMESTAMP(3),
ADD COLUMN     "imagingAdvice" TEXT,
ADD COLUMN     "presentIllness" TEXT,
ADD COLUMN     "relevantHistory" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "DoctorProfile" ADD COLUMN     "qualification" TEXT,
ADD COLUMN     "registrationNumber" TEXT;

-- AlterTable
ALTER TABLE "Prescription" ADD COLUMN     "afternoon" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "foodTiming" TEXT,
ADD COLUMN     "morning" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "night" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "strength" TEXT;

-- CreateTable
CREATE TABLE "DoctorCatalogItem" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "kind" "CatalogKind" NOT NULL,
    "name" TEXT NOT NULL,
    "strength" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DoctorCatalogItem_clinicId_kind_idx" ON "DoctorCatalogItem"("clinicId", "kind");

-- AddForeignKey
ALTER TABLE "DoctorCatalogItem" ADD CONSTRAINT "DoctorCatalogItem_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
