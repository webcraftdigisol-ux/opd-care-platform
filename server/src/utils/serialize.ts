import type {
  User,
  Clinic,
  DoctorProfile as PrismaDoctorProfile,
  Schedule as PrismaSchedule,
  Appointment as PrismaAppointment,
  Consultation as PrismaConsultation,
  Prescription as PrismaPrescription,
  LabTestOrder as PrismaLabTestOrder,
  PharmacyItem as PrismaPharmacyItem,
  PharmacySale as PrismaPharmacySale,
  PharmacySaleItem as PrismaPharmacySaleItem,
  LabTestCatalog as PrismaLabTestCatalog,
  LabInvoice as PrismaLabInvoice,
  LabResultItem as PrismaLabResultItem,
  RadiologyTestOrder as PrismaRadiologyTestOrder,
  RadiologyCatalog as PrismaRadiologyCatalog,
  RadiologyInvoice as PrismaRadiologyInvoice,
  RadiologyResultItem as PrismaRadiologyResultItem,
  Ward as PrismaWard,
  Bed as PrismaBed,
  Admission as PrismaAdmission,
  RoomTransfer as PrismaRoomTransfer,
  IpdDoctorVisit as PrismaIpdDoctorVisit,
  IpdProcedure as PrismaIpdProcedure,
  IpdMedication as PrismaIpdMedication,
  IpdVitals as PrismaIpdVitals,
  IpdCharge as PrismaIpdCharge,
  IpdBill as PrismaIpdBill,
} from '@prisma/client';
import type {
  PublicUser,
  ClinicSummary,
  DoctorProfile,
  Schedule,
  Appointment,
  Consultation,
  Prescription,
  LabTestOrder,
  PharmacyItem,
  PharmacySale,
  PharmacySaleItem,
  LabTestCatalogEntry,
  LabInvoice,
  LabResultItem,
  RadiologyTestOrder,
  RadiologyTestCatalogEntry,
  RadiologyInvoice,
  RadiologyResultItem,
  Ward,
  Bed,
  Admission,
  AdmissionDetail,
  RoomTransferRecord,
  DoctorVisitRecord,
  ProcedureRecord,
  MedicationRecord,
  VitalsRecord,
  ChargeRecord,
  IpdBill,
} from '@opd/shared';

export function toClinicSummary(clinic: Clinic): ClinicSummary {
  return {
    id: clinic.id,
    slug: clinic.slug,
    name: clinic.name,
    tier: clinic.tier as ClinicSummary['tier'],
    logoUrl: clinic.logoUrl,
    taxPercent: clinic.taxPercent,
  };
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    clinicId: user.clinicId,
    email: user.email,
    phone: user.phone,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toDoctorProfile(doctor: PrismaDoctorProfile & { user: User }): DoctorProfile {
  return {
    id: doctor.id,
    userId: doctor.userId,
    specialization: doctor.specialization,
    department: doctor.department,
    slotMinutes: doctor.slotMinutes,
    user: toPublicUser(doctor.user),
  };
}

export function toSchedule(schedule: PrismaSchedule): Schedule {
  return {
    id: schedule.id,
    doctorId: schedule.doctorId,
    dayOfWeek: schedule.dayOfWeek,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
  };
}

export function toPrescription(p: PrismaPrescription): Prescription {
  return {
    id: p.id,
    consultationId: p.consultationId,
    medicine: p.medicine,
    dosage: p.dosage,
    frequency: p.frequency,
    durationDays: p.durationDays,
    notes: p.notes,
  };
}

export function toLabTestOrder(o: PrismaLabTestOrder): LabTestOrder {
  return {
    id: o.id,
    consultationId: o.consultationId,
    testName: o.testName,
    notes: o.notes,
  };
}

export function toRadiologyTestOrder(o: PrismaRadiologyTestOrder): RadiologyTestOrder {
  return {
    id: o.id,
    consultationId: o.consultationId,
    testName: o.testName,
    notes: o.notes,
  };
}

export function toConsultation(
  c: PrismaConsultation & {
    prescriptions?: PrismaPrescription[];
    labTestsOrdered?: PrismaLabTestOrder[];
    radiologyOrdered?: PrismaRadiologyTestOrder[];
  },
): Consultation {
  return {
    id: c.id,
    appointmentId: c.appointmentId,
    vitals: (c.vitals as Consultation['vitals']) ?? null,
    diagnosis: c.diagnosis,
    notes: c.notes,
    followUpDate: c.followUpDate ? c.followUpDate.toISOString().slice(0, 10) : null,
    followUpContacted: c.followUpContacted,
    createdAt: c.createdAt.toISOString(),
    prescriptions: (c.prescriptions ?? []).map(toPrescription),
    labTestsOrdered: (c.labTestsOrdered ?? []).map(toLabTestOrder),
    radiologyOrdered: (c.radiologyOrdered ?? []).map(toRadiologyTestOrder),
  };
}

type AppointmentWithRelations = PrismaAppointment & {
  patient?: User;
  doctor?: PrismaDoctorProfile & { user: User };
  consultation?:
    | (PrismaConsultation & {
        prescriptions?: PrismaPrescription[];
        labTestsOrdered?: PrismaLabTestOrder[];
        radiologyOrdered?: PrismaRadiologyTestOrder[];
      })
    | null;
};

export function toAppointment(a: AppointmentWithRelations): Appointment {
  return {
    id: a.id,
    patientId: a.patientId,
    patient: a.patient ? toPublicUser(a.patient) : undefined,
    doctorId: a.doctorId,
    doctor: a.doctor ? toDoctorProfile(a.doctor) : undefined,
    date: a.date.toISOString().slice(0, 10),
    tokenNumber: a.tokenNumber,
    status: a.status,
    isWalkIn: a.isWalkIn,
    reason: a.reason,
    createdAt: a.createdAt.toISOString(),
    consultation: a.consultation ? toConsultation(a.consultation) : a.consultation === null ? null : undefined,
  };
}

export function toPharmacyItem(item: PrismaPharmacyItem): PharmacyItem {
  return {
    id: item.id,
    name: item.name,
    unitsPerStrip: item.unitsPerStrip,
    pricePerUnit: item.pricePerUnit,
    costPricePerUnit: item.costPricePerUnit,
    stockUnits: item.stockUnits,
  };
}

export function toPharmacySaleItem(item: PrismaPharmacySaleItem): PharmacySaleItem {
  return {
    id: item.id,
    prescriptionId: item.prescriptionId,
    itemId: item.itemId,
    medicineName: item.medicineName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
  };
}

export function toPharmacySale(
  sale: PrismaPharmacySale & { items?: PrismaPharmacySaleItem[]; patient?: User },
): PharmacySale {
  return {
    id: sale.id,
    patientId: sale.patientId,
    patient: sale.patient ? toPublicUser(sale.patient) : undefined,
    appointmentId: sale.appointmentId,
    admissionId: sale.admissionId,
    soldById: sale.soldById,
    taxPercent: sale.taxPercent,
    subtotal: sale.subtotal,
    taxAmount: sale.taxAmount,
    total: sale.total,
    createdAt: sale.createdAt.toISOString(),
    items: (sale.items ?? []).map(toPharmacySaleItem),
  };
}

export function toLabTestCatalogEntry(entry: PrismaLabTestCatalog): LabTestCatalogEntry {
  return { id: entry.id, name: entry.name, price: entry.price };
}

export function toLabResultItem(item: PrismaLabResultItem): LabResultItem {
  return {
    id: item.id,
    orderId: item.orderId,
    catalogItemId: item.catalogItemId,
    testName: item.testName,
    resultText: item.resultText,
    price: item.price,
  };
}

export function toLabInvoice(
  invoice: PrismaLabInvoice & { items?: PrismaLabResultItem[]; patient?: User },
): LabInvoice {
  return {
    id: invoice.id,
    patientId: invoice.patientId,
    patient: invoice.patient ? toPublicUser(invoice.patient) : undefined,
    appointmentId: invoice.appointmentId,
    admissionId: invoice.admissionId,
    recordedById: invoice.recordedById,
    taxPercent: invoice.taxPercent,
    subtotal: invoice.subtotal,
    taxAmount: invoice.taxAmount,
    total: invoice.total,
    createdAt: invoice.createdAt.toISOString(),
    items: (invoice.items ?? []).map(toLabResultItem),
  };
}

export function toRadiologyTestCatalogEntry(entry: PrismaRadiologyCatalog): RadiologyTestCatalogEntry {
  return { id: entry.id, name: entry.name, price: entry.price };
}

export function toRadiologyResultItem(item: PrismaRadiologyResultItem): RadiologyResultItem {
  return {
    id: item.id,
    orderId: item.orderId,
    catalogItemId: item.catalogItemId,
    testName: item.testName,
    resultText: item.resultText,
    price: item.price,
  };
}

export function toRadiologyInvoice(
  invoice: PrismaRadiologyInvoice & { items?: PrismaRadiologyResultItem[]; patient?: User },
): RadiologyInvoice {
  return {
    id: invoice.id,
    patientId: invoice.patientId,
    patient: invoice.patient ? toPublicUser(invoice.patient) : undefined,
    appointmentId: invoice.appointmentId,
    admissionId: invoice.admissionId,
    recordedById: invoice.recordedById,
    taxPercent: invoice.taxPercent,
    subtotal: invoice.subtotal,
    taxAmount: invoice.taxAmount,
    total: invoice.total,
    createdAt: invoice.createdAt.toISOString(),
    items: (invoice.items ?? []).map(toRadiologyResultItem),
  };
}

// ---- In-Patient / IPD (Tier 3) ----

export function toBed(bed: PrismaBed): Bed {
  return {
    id: bed.id,
    wardId: bed.wardId,
    label: bed.label,
    dailyRate: bed.dailyRate,
    status: bed.status,
  };
}

export function toWard(ward: PrismaWard & { beds?: PrismaBed[] }): Ward {
  return {
    id: ward.id,
    name: ward.name,
    beds: (ward.beds ?? []).map(toBed),
  };
}

export function toRoomTransfer(
  transfer: PrismaRoomTransfer & { fromBed?: PrismaBed | null; toBed: PrismaBed },
): RoomTransferRecord {
  return {
    id: transfer.id,
    admissionId: transfer.admissionId,
    fromBedLabel: transfer.fromBed?.label ?? null,
    toBedLabel: transfer.toBed.label,
    transferredAt: transfer.transferredAt.toISOString(),
  };
}

export function toDoctorVisit(
  visit: PrismaIpdDoctorVisit & { doctor: PrismaDoctorProfile & { user: User } },
): DoctorVisitRecord {
  return {
    id: visit.id,
    admissionId: visit.admissionId,
    doctorId: visit.doctorId,
    doctorName: visit.doctor.user.name,
    notes: visit.notes,
    fee: visit.fee,
    visitedAt: visit.visitedAt.toISOString(),
  };
}

export function toProcedure(procedure: PrismaIpdProcedure): ProcedureRecord {
  return {
    id: procedure.id,
    admissionId: procedure.admissionId,
    name: procedure.name,
    notes: procedure.notes,
    consentSigned: procedure.consentSigned,
    fee: procedure.fee,
    performedAt: procedure.performedAt.toISOString(),
  };
}

export function toMedication(medication: PrismaIpdMedication): MedicationRecord {
  return {
    id: medication.id,
    admissionId: medication.admissionId,
    medicine: medication.medicine,
    dosage: medication.dosage,
    quantity: medication.quantity,
    unitPrice: medication.unitPrice,
    source: medication.source,
    givenAt: medication.givenAt.toISOString(),
  };
}

export function toVitalsRecord(vitals: PrismaIpdVitals & { recordedBy: User }): VitalsRecord {
  return {
    id: vitals.id,
    admissionId: vitals.admissionId,
    pulse: vitals.pulse,
    bpSystolic: vitals.bpSystolic,
    bpDiastolic: vitals.bpDiastolic,
    tempC: vitals.tempC,
    spo2: vitals.spo2,
    recordedById: vitals.recordedById,
    recordedByName: vitals.recordedBy.name,
    recordedAt: vitals.recordedAt.toISOString(),
  };
}

export function toCharge(charge: PrismaIpdCharge): ChargeRecord {
  return {
    id: charge.id,
    admissionId: charge.admissionId,
    description: charge.description,
    amount: charge.amount,
    chargedAt: charge.chargedAt.toISOString(),
  };
}

export function toIpdBill(bill: PrismaIpdBill): IpdBill {
  return {
    id: bill.id,
    admissionId: bill.admissionId,
    roomCharges: bill.roomCharges,
    doctorVisitCharges: bill.doctorVisitCharges,
    procedureCharges: bill.procedureCharges,
    medicationCharges: bill.medicationCharges,
    adHocCharges: bill.adHocCharges,
    pharmacyCharges: bill.pharmacyCharges,
    labCharges: bill.labCharges,
    radiologyCharges: bill.radiologyCharges,
    subtotal: bill.subtotal,
    taxPercent: bill.taxPercent,
    taxAmount: bill.taxAmount,
    total: bill.total,
    depositAmount: bill.depositAmount,
    amountDue: bill.amountDue,
    createdAt: bill.createdAt.toISOString(),
  };
}

type AdmissionWithRelations = PrismaAdmission & {
  patient?: User;
  bed: PrismaBed & { ward: PrismaWard };
  admittingDoctor: PrismaDoctorProfile & { user: User };
};

export function toAdmission(a: AdmissionWithRelations): Admission {
  return {
    id: a.id,
    patientId: a.patientId,
    patient: a.patient ? toPublicUser(a.patient) : undefined,
    bedId: a.bedId,
    bedLabel: a.bed.label,
    wardName: a.bed.ward.name,
    admittingDoctorId: a.admittingDoctorId,
    admittingDoctorName: a.admittingDoctor.user.name,
    reason: a.reason,
    depositAmount: a.depositAmount,
    status: a.status,
    admittedAt: a.admittedAt.toISOString(),
    dischargedAt: a.dischargedAt ? a.dischargedAt.toISOString() : null,
    dischargeSummary: a.dischargeSummary,
  };
}

type AdmissionDetailSource = AdmissionWithRelations & {
  roomTransfers: (PrismaRoomTransfer & { fromBed?: PrismaBed | null; toBed: PrismaBed })[];
  doctorVisits: (PrismaIpdDoctorVisit & { doctor: PrismaDoctorProfile & { user: User } })[];
  procedures: PrismaIpdProcedure[];
  medications: PrismaIpdMedication[];
  vitalsLogs: (PrismaIpdVitals & { recordedBy: User })[];
  charges: PrismaIpdCharge[];
  pharmacySales: (PrismaPharmacySale & { items?: PrismaPharmacySaleItem[]; patient?: User })[];
  labInvoices: (PrismaLabInvoice & { items?: PrismaLabResultItem[]; patient?: User })[];
  radiologyInvoices: (PrismaRadiologyInvoice & { items?: PrismaRadiologyResultItem[]; patient?: User })[];
  bill: PrismaIpdBill | null;
};

export function toAdmissionDetail(a: AdmissionDetailSource): AdmissionDetail {
  return {
    ...toAdmission(a),
    roomTransfers: a.roomTransfers.map(toRoomTransfer),
    doctorVisits: a.doctorVisits.map(toDoctorVisit),
    procedures: a.procedures.map(toProcedure),
    medications: a.medications.map(toMedication),
    vitalsLogs: a.vitalsLogs.map(toVitalsRecord),
    charges: a.charges.map(toCharge),
    pharmacySales: a.pharmacySales.map(toPharmacySale),
    labInvoices: a.labInvoices.map(toLabInvoice),
    radiologyInvoices: a.radiologyInvoices.map(toRadiologyInvoice),
    bill: a.bill ? toIpdBill(a.bill) : null,
  };
}
