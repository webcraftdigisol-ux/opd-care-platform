-- CreateEnum
CREATE TYPE "MedicineSystem" AS ENUM ('ALLOPATHIC', 'AYURVEDIC', 'HOMEOPATHIC', 'MIXED');

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "medicineSystem" "MedicineSystem" NOT NULL DEFAULT 'ALLOPATHIC';

