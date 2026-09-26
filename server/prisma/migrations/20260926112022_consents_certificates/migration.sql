-- CreateEnum
CREATE TYPE "ConsentKind" AS ENUM ('PROCEDURE', 'SURGERY', 'ANAESTHESIA', 'BLOOD_TRANSFUSION', 'HIGH_RISK');

-- CreateEnum
CREATE TYPE "CertificateType" AS ENUM ('MEDICAL_FITNESS', 'SICK_LEAVE', 'FIT_TO_RESUME', 'FIT_TO_TRAVEL', 'GENERAL');

-- AlterEnum
ALTER TYPE "AttachmentCategory" ADD VALUE 'CONSENT_FORM';

-- AlterTable
ALTER TABLE "IpdProcedure" ADD COLUMN     "consentFormId" TEXT;

-- CreateTable
CREATE TABLE "ConsentForm" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "kind" "ConsentKind" NOT NULL,
    "procedureName" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "plannedAt" TIMESTAMP(3),
    "anaesthesia" TEXT,
    "purpose" TEXT,
    "risks" TEXT,
    "alternatives" TEXT,
    "signedAt" TIMESTAMP(3),
    "signedByName" TEXT,
    "signerRelation" TEXT,
    "witnessName" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalCertificate" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "type" "CertificateType" NOT NULL,
    "diagnosis" TEXT,
    "fromDate" DATE,
    "toDate" DATE,
    "purpose" TEXT,
    "body" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicalCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentForm_admissionId_idx" ON "ConsentForm"("admissionId");

-- CreateIndex
CREATE INDEX "ConsentForm_clinicId_idx" ON "ConsentForm"("clinicId");

-- CreateIndex
CREATE INDEX "MedicalCertificate_clinicId_idx" ON "MedicalCertificate"("clinicId");

-- CreateIndex
CREATE INDEX "MedicalCertificate_patientId_idx" ON "MedicalCertificate"("patientId");

-- AddForeignKey
ALTER TABLE "IpdProcedure" ADD CONSTRAINT "IpdProcedure_consentFormId_fkey" FOREIGN KEY ("consentFormId") REFERENCES "ConsentForm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentForm" ADD CONSTRAINT "ConsentForm_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentForm" ADD CONSTRAINT "ConsentForm_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentForm" ADD CONSTRAINT "ConsentForm_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentForm" ADD CONSTRAINT "ConsentForm_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalCertificate" ADD CONSTRAINT "MedicalCertificate_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalCertificate" ADD CONSTRAINT "MedicalCertificate_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalCertificate" ADD CONSTRAINT "MedicalCertificate_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

