-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AttachmentCategory" ADD VALUE 'PATIENT_REPORT';
ALTER TYPE "AttachmentCategory" ADD VALUE 'PATIENT_IMAGE';

-- AlterTable
ALTER TABLE "DoctorCatalogItem" ADD COLUMN     "brands" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Prescription" ADD COLUMN     "brand" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "username" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_clinicId_username_key" ON "User"("clinicId", "username");

