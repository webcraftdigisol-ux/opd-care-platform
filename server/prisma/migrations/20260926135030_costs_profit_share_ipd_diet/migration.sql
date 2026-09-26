-- CreateEnum
CREATE TYPE "ShareDepartment" AS ENUM ('PHARMACY', 'LAB', 'RADIOLOGY');

-- AlterTable
ALTER TABLE "DietPlan" ADD COLUMN     "admissionId" TEXT;

-- AlterTable
ALTER TABLE "LabResultItem" ADD COLUMN     "cost" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "LabTestCatalog" ADD COLUMN     "cost" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PharmacySaleItem" ADD COLUMN     "unitCost" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "RadiologyCatalog" ADD COLUMN     "cost" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "RadiologyResultItem" ADD COLUMN     "cost" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ProfitShareRate" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "doctorId" TEXT,
    "department" "ShareDepartment" NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfitShareRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProfitShareRate_clinicId_idx" ON "ProfitShareRate"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfitShareRate_clinicId_doctorId_department_key" ON "ProfitShareRate"("clinicId", "doctorId", "department");

-- AddForeignKey
ALTER TABLE "DietPlan" ADD CONSTRAINT "DietPlan_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfitShareRate" ADD CONSTRAINT "ProfitShareRate_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfitShareRate" ADD CONSTRAINT "ProfitShareRate_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

