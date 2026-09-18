-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'RADIOLOGY_TECHNICIAN';

-- AlterTable
ALTER TABLE "IpdBill" ADD COLUMN     "radiologyCharges" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RadiologyTestOrder" (
    "id" TEXT NOT NULL,
    "consultationId" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "RadiologyTestOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadiologyCatalog" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "RadiologyCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadiologyInvoice" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "admissionId" TEXT,
    "recordedById" TEXT NOT NULL,
    "taxPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "taxAmount" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RadiologyInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RadiologyResultItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "orderId" TEXT,
    "catalogItemId" TEXT,
    "testName" TEXT NOT NULL,
    "resultText" TEXT,
    "price" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "RadiologyResultItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RadiologyTestOrder_consultationId_idx" ON "RadiologyTestOrder"("consultationId");

-- CreateIndex
CREATE INDEX "RadiologyCatalog_clinicId_idx" ON "RadiologyCatalog"("clinicId");

-- CreateIndex
CREATE INDEX "RadiologyInvoice_clinicId_idx" ON "RadiologyInvoice"("clinicId");

-- CreateIndex
CREATE INDEX "RadiologyInvoice_patientId_idx" ON "RadiologyInvoice"("patientId");

-- CreateIndex
CREATE INDEX "RadiologyInvoice_admissionId_idx" ON "RadiologyInvoice"("admissionId");

-- CreateIndex
CREATE INDEX "RadiologyResultItem_invoiceId_idx" ON "RadiologyResultItem"("invoiceId");

-- AddForeignKey
ALTER TABLE "RadiologyTestOrder" ADD CONSTRAINT "RadiologyTestOrder_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiologyCatalog" ADD CONSTRAINT "RadiologyCatalog_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiologyInvoice" ADD CONSTRAINT "RadiologyInvoice_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiologyInvoice" ADD CONSTRAINT "RadiologyInvoice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiologyInvoice" ADD CONSTRAINT "RadiologyInvoice_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiologyInvoice" ADD CONSTRAINT "RadiologyInvoice_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "Admission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiologyInvoice" ADD CONSTRAINT "RadiologyInvoice_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiologyResultItem" ADD CONSTRAINT "RadiologyResultItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "RadiologyInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiologyResultItem" ADD CONSTRAINT "RadiologyResultItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "RadiologyTestOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RadiologyResultItem" ADD CONSTRAINT "RadiologyResultItem_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "RadiologyCatalog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
