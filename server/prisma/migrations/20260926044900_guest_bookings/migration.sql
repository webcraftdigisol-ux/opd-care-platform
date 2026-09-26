-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "guestName" TEXT,
ADD COLUMN     "guestPhone" TEXT,
ALTER COLUMN "patientId" DROP NOT NULL;
