-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'APPOINTMENT_REMINDER';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "reminderSentAt" TIMESTAMP(3);
