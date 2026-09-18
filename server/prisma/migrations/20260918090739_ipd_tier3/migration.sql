-- CreateEnum
CREATE TYPE "BedStatus" AS ENUM ('VACANT', 'OCCUPIED', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "AdmissionStatus" AS ENUM ('ADMITTED', 'DISCHARGED');

-- CreateEnum
CREATE TYPE "MedicationSource" AS ENUM ('CLINIC_SUPPLIED', 'PATIENT_OWN');

-- AlterTable
ALTER TABLE "LabInvoice" ADD COLUMN     "admissionId" TEXT;

-- AlterTable
ALTER TABLE "PharmacySale" ADD COLUMN     "admissionId" TEXT;

-- CreateTable
CREATE TABLE "Ward" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Ward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bed" (
    "id" TEXT NOT NULL,
    "wardId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dailyRate" DOUBLE PRECISION NOT NULL,
    "status" "BedStatus" NOT NULL DEFAULT 'VACANT',

    CONSTRAINT "Bed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admission" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "bedId" TEXT NOT NULL,
    "admittingDoctorId" TEXT NOT NULL,
    "reason" TEXT,
    "depositAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "AdmissionStatus" NOT NULL DEFAULT 'ADMITTED',
    "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dischargedAt" TIMESTAMP(3),
    "dischargeSummary" TEXT,

    CONSTRAINT "Admission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomTransfer" (
    "id" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "fromBedId" TEXT,
    "toBedId" TEXT NOT NULL,
    "transferredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpdDoctorVisit" (
    "id" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "notes" TEXT,
    "fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IpdDoctorVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpdProcedure" (
    "id" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "consentSigned" BOOLEAN NOT NULL DEFAULT false,
    "fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IpdProcedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpdMedication" (
    "id" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "medicine" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" "MedicationSource" NOT NULL,
    "givenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IpdMedication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpdVitals" (
    "id" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "pulse" INTEGER,
    "bpSystolic" INTEGER,
    "bpDiastolic" INTEGER,
    "tempC" DOUBLE PRECISION,
    "spo2" INTEGER,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IpdVitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpdCharge" (
    "id" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "chargedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IpdCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpdBill" (
    "id" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "roomCharges" DOUBLE PRECISION NOT NULL,
    "doctorVisitCharges" DOUBLE PRECISION NOT NULL,
    "procedureCharges" DOUBLE PRECISION NOT NULL,
    "medicationCharges" DOUBLE PRECISION NOT NULL,
    "adHocCharges" DOUBLE PRECISION NOT NULL,
    "pharmacyCharges" DOUBLE PRECISION NOT NULL,
    "labCharges" DOUBLE PRECISION NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "taxPercent" DOUBLE PRECISION NOT NULL,
    "taxAmount" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "depositAmount" DOUBLE PRECISION NOT NULL,
    "amountDue" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IpdBill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Ward_clinicId_idx" ON "Ward"("clinicId");

-- CreateIndex
CREATE INDEX "Bed_wardId_idx" ON "Bed"("wardId");

-- CreateIndex
CREATE INDEX "Admission_clinicId_idx" ON "Admission"("clinicId");

-- CreateIndex
CREATE INDEX "Admission_patientId_idx" ON "Admission"("patientId");

-- CreateIndex
CREATE INDEX "Admission_bedId_idx" ON "Admission"("bedId");

-- CreateIndex
CREATE INDEX "RoomTransfer_admissionId_idx" ON "RoomTransfer"("admissionId");

-- CreateIndex
CREATE INDEX "IpdDoctorVisit_admissionId_idx" ON "IpdDoctorVisit"("admissionId");

-- CreateIndex
CREATE INDEX "IpdProcedure_admissionId_idx" ON "IpdProcedure"("admissionId");

-- CreateIndex
CREATE INDEX "IpdMedication_admissionId_idx" ON "IpdMedication"("admissionId");

-- CreateIndex
CREATE INDEX "IpdVitals_admissionId_idx" ON "IpdVitals"("admissionId");

-- CreateIndex
CREATE INDEX "IpdCharge_admissionId_idx" ON "IpdCharge"("admissionId");

-- CreateIndex
CREATE UNIQUE INDEX "IpdBill_admissionId_key" ON "IpdBill"("admissionId");

-- CreateIndex
CREATE INDEX "LabInvoice_admissionId_idx" ON "LabInvoice"("admissionId");

-- CreateIndex
CREATE INDEX "PharmacySale_admissionId_idx" ON "PharmacySale"("admissionId");

-- AddForeignKey
ALTER TABLE "PharmacySale" ADD CONSTRAINT "PharmacySale_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabInvoice" ADD CONSTRAINT "LabInvoice_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ward" ADD CONSTRAINT "Ward_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bed" ADD CONSTRAINT "Bed_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "Ward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_bedId_fkey" FOREIGN KEY ("bedId") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Admission" ADD CONSTRAINT "Admission_admittingDoctorId_fkey" FOREIGN KEY ("admittingDoctorId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomTransfer" ADD CONSTRAINT "RoomTransfer_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomTransfer" ADD CONSTRAINT "RoomTransfer_fromBedId_fkey" FOREIGN KEY ("fromBedId") REFERENCES "Bed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomTransfer" ADD CONSTRAINT "RoomTransfer_toBedId_fkey" FOREIGN KEY ("toBedId") REFERENCES "Bed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpdDoctorVisit" ADD CONSTRAINT "IpdDoctorVisit_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpdDoctorVisit" ADD CONSTRAINT "IpdDoctorVisit_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpdProcedure" ADD CONSTRAINT "IpdProcedure_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpdMedication" ADD CONSTRAINT "IpdMedication_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpdVitals" ADD CONSTRAINT "IpdVitals_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpdVitals" ADD CONSTRAINT "IpdVitals_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpdCharge" ADD CONSTRAINT "IpdCharge_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IpdBill" ADD CONSTRAINT "IpdBill_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
