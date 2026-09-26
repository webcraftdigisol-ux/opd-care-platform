-- DropIndex
DROP INDEX "User_clinicId_phone_key";

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "lastPatientNumber" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PatientProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientCode" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "lastName" TEXT,
    "gender" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "ageYears" INTEGER,
    "ageRecordedAt" TIMESTAMP(3),
    "bloodGroup" TEXT,
    "maritalStatus" TEXT,
    "nationality" TEXT,
    "alternatePhone" TEXT,
    "emergencyContact" TEXT,
    "occupation" TEXT,
    "referredBy" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "heightCm" DOUBLE PRECISION,
    "weightKg" DOUBLE PRECISION,
    "allergies" TEXT,
    "chronicDiseases" TEXT,
    "pastSurgeries" TEXT,
    "familyHistory" TEXT,
    "insuranceDetails" TEXT,
    "tpa" TEXT,
    "doctorNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientProfile_userId_key" ON "PatientProfile"("userId");

-- CreateIndex
CREATE INDEX "PatientProfile_clinicId_idx" ON "PatientProfile"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProfile_clinicId_patientCode_key" ON "PatientProfile"("clinicId", "patientCode");

-- CreateIndex
CREATE INDEX "User_clinicId_phone_idx" ON "User"("clinicId", "phone");

-- AddForeignKey
ALTER TABLE "PatientProfile" ADD CONSTRAINT "PatientProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatientProfile" ADD CONSTRAINT "PatientProfile_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing patient gets a profile and a Patient ID, numbered
-- per clinic in registration order. The full name goes in firstName (it
-- can't be split reliably); staff can correct it from the profile.
INSERT INTO "PatientProfile" ("id", "userId", "clinicId", "patientCode", "firstName", "updatedAt")
SELECT gen_random_uuid()::text,
       u."id",
       u."clinicId",
       'PT' || lpad((row_number() OVER (PARTITION BY u."clinicId" ORDER BY u."createdAt", u."id"))::text, 6, '0'),
       u."name",
       CURRENT_TIMESTAMP
FROM "User" u
WHERE u."role" = 'PATIENT';

UPDATE "Clinic" c
SET "lastPatientNumber" = sub.n
FROM (SELECT "clinicId", count(*)::int AS n FROM "PatientProfile" GROUP BY "clinicId") sub
WHERE sub."clinicId" = c."id";

-- Phones lose their spacing/punctuation so the patient search can match
-- typed digits against them ("+91 98765 43210" -> "+919876543210").
UPDATE "User" SET "phone" = regexp_replace("phone", '[^0-9+]', '', 'g') WHERE "phone" IS NOT NULL;
UPDATE "PatientProfile" SET "alternatePhone" = regexp_replace("alternatePhone", '[^0-9+]', '', 'g') WHERE "alternatePhone" IS NOT NULL;
