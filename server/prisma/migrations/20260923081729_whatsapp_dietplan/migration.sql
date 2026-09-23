-- CreateEnum
CREATE TYPE "DietaryPreference" AS ENUM ('VEG', 'NON_VEG', 'EGGETARIAN', 'VEGAN');

-- AlterEnum
ALTER TYPE "NotificationChannel" ADD VALUE 'WHATSAPP';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "providerMessageId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DietPlan" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "consultationId" TEXT,
    "createdById" TEXT NOT NULL,
    "dietaryPreference" "DietaryPreference" NOT NULL,
    "allergies" TEXT,
    "localFoodNotes" TEXT,
    "planText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DietPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DietPlan_clinicId_idx" ON "DietPlan"("clinicId");

-- CreateIndex
CREATE INDEX "DietPlan_patientId_idx" ON "DietPlan"("patientId");

-- AddForeignKey
ALTER TABLE "DietPlan" ADD CONSTRAINT "DietPlan_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DietPlan" ADD CONSTRAINT "DietPlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DietPlan" ADD CONSTRAINT "DietPlan_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DietPlan" ADD CONSTRAINT "DietPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
