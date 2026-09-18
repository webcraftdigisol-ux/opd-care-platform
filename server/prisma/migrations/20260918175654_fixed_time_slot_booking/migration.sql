-- DropIndex
DROP INDEX "Appointment_doctorId_date_idx";

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "startTime" TEXT;

-- CreateIndex
CREATE INDEX "Appointment_doctorId_date_startTime_idx" ON "Appointment"("doctorId", "date", "startTime");
