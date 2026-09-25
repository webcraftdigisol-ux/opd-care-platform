-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PASSWORD_RESET_OTP';

-- AlterTable
ALTER TABLE "Consultation" ADD COLUMN     "followUpReminderSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "whatsappOptInAt" TIMESTAMP(3),
ADD COLUMN     "whatsappOptInRecordedById" TEXT;

-- CreateTable
CREATE TABLE "PasswordResetOtp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PasswordResetOtp_userId_createdAt_idx" ON "PasswordResetOtp"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "PasswordResetOtp" ADD CONSTRAINT "PasswordResetOtp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: patients who already opted in did so themselves; the best
-- available record of when is their row's last update.
UPDATE "User" SET "whatsappOptInAt" = "updatedAt" WHERE "whatsappOptIn" = true;
