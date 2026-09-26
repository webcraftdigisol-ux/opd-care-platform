import { totalToDispense } from './dosage';
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
  Payment as PrismaPayment,
  Notification as PrismaNotification,
  Attachment as PrismaAttachment,
  Subscription as PrismaSubscription,
  SubscriptionPayment as PrismaSubscriptionPayment,
  PlatformAdmin,
  DietPlan as PrismaDietPlan,
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
  Payment,
  Notification,
  Attachment,
  Subscription,
  SubscriptionPayment,
  ClinicWithSubscription,
  ClinicTier,
  DietPlan,
} from '@opd/shared';
import { isSubscriptionActive } from '../middleware/auth';

export function toClinicSummary(clinic: Clinic): ClinicSummary {
  return {
    id: clinic.id,
    slug: clinic.slug,
    name: clinic.name,
    tier: clinic.tier as ClinicSummary['tier'],
    logoUrl: clinic.logoUrl,
    taxPercent: clinic.taxPercent,
    address: clinic.address,
    phone: clinic.phone,
  };
}

// Include this in place of `patient: true` wherever the patient's Patient
// ID should appear alongside their name (queues, lists).
export const patientWithCode = { include: { patientProfile: { select: { patientCode: true } } } } as const;

export function toPublicUser(user: User & { patientProfile?: { patientCode: string } | null }): PublicUser {
  return {
    id: user.id,
    clinicId: user.clinicId,
    email: user.email,
    phone: user.phone,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
    whatsappOptIn: user.whatsappOptIn,
    ...(user.role !== 'PATIENT' ? { username: user.username, active: user.active } : {}),
    ...(user.patientProfile !== undefined ? { patientCode: user.patientProfile?.patientCode ?? null } : {}),
  };
}

export function toDoctorProfile(doctor: PrismaDoctorProfile & { user: User }): DoctorProfile {
  return {
    id: doctor.id,
    userId: doctor.userId,
    specialization: doctor.specialization,
    department: doctor.department,
    slotMinutes: doctor.slotMinutes,
    consultationFee: doctor.consultationFee,
    qualification: doctor.qualification,
    registrationNumber: doctor.registrationNumber,
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
    strength: p.strength,
    brand: p.brand,
    dosage: p.dosage,
    frequency: p.frequency,
    morning: p.morning,
    afternoon: p.afternoon,
    night: p.night,
    foodTiming: (p.foodTiming as Prescription['foodTiming']) ?? null,
    durationDays: p.durationDays,
    notes: p.notes,
    totalToDispense: totalToDispense(p),
  };
}

export function toDietPlan(plan: PrismaDietPlan & { createdBy?: User }): DietPlan {
  return {
    id: plan.id,
    clinicId: plan.clinicId,
    patientId: plan.patientId,
    consultationId: plan.consultationId,
    admissionId: plan.admissionId,
    createdById: plan.createdById,
    createdByName: plan.createdBy?.name,
    dietaryPreference: plan.dietaryPreference,
    allergies: plan.allergies,
    localFoodNotes: plan.localFoodNotes,
    planText: plan.planText,
    createdAt: plan.createdAt.toISOString(),
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
    chiefComplaint: c.chiefComplaint,
    presentIllness: c.presentIllness,
    relevantHistory: c.relevantHistory,
    diagnosis: c.diagnosis,
    differentialDiagnosis: c.differentialDiagnosis,
    notes: c.notes,
    imagingAdvice: c.imagingAdvice,
    doctorNotes: c.doctorNotes,
    followUpDate: c.followUpDate ? c.followUpDate.toISOString().slice(0, 10) : null,
    followUpContacted: c.followUpContacted,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    prescriptions: (c.prescriptions ?? []).map(toPrescription),
    labTestsOrdered: (c.labTestsOrdered ?? []).map(toLabTestOrder),
    radiologyOrdered: (c.radiologyOrdered ?? []).map(toRadiologyTestOrder),
  };
}

type AppointmentWithRelations = PrismaAppointment & {
  patient?: (User & { patientProfile?: { patientCode: string } | null }) | null;
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
    guestName: a.guestName,
    guestPhone: a.guestPhone,
    doctorId: a.doctorId,
    doctor: a.doctor ? toDoctorProfile(a.doctor) : undefined,
    date: a.date.toISOString().slice(0, 10),
    tokenNumber: a.tokenNumber,
    startTime: a.startTime,
    status: a.status,
    isWalkIn: a.isWalkIn,
    reason: a.reason,
    consultationFee: a.consultationFee,
    createdAt: a.createdAt.toISOString(),
    consultation: a.consultation ? toConsultation(a.consultation) : a.consultation === null ? null : undefined,
  };
}

export function toPharmacyItem(item: PrismaPharmacyItem): PharmacyItem {
  return {
    id: item.id,
    name: item.name,
    strength: item.strength,
    brand: item.brand,
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
    substitutedFor: item.substitutedFor,
    quantity: item.quantity,
    unitCost: item.unitCost,
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
  return { id: entry.id, name: entry.name, price: entry.price, cost: entry.cost };
}

export function toLabResultItem(item: PrismaLabResultItem): LabResultItem {
  return {
    id: item.id,
    orderId: item.orderId,
    catalogItemId: item.catalogItemId,
    testName: item.testName,
    substitutedFor: item.substitutedFor,
    cost: item.cost,
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
  return { id: entry.id, name: entry.name, price: entry.price, cost: entry.cost };
}

export function toRadiologyResultItem(item: PrismaRadiologyResultItem): RadiologyResultItem {
  return {
    id: item.id,
    orderId: item.orderId,
    catalogItemId: item.catalogItemId,
    testName: item.testName,
    substitutedFor: item.substitutedFor,
    cost: item.cost,
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
    consentFormId: procedure.consentFormId,
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

// ---- Payments & Notifications ----

export function toPayment(payment: PrismaPayment & { recordedBy?: User }): Payment {
  return {
    id: payment.id,
    patientId: payment.patientId,
    billType: payment.billType,
    billId: payment.billId,
    amount: payment.amount,
    method: payment.method,
    recordedById: payment.recordedById,
    recordedByName: payment.recordedBy?.name,
    createdAt: payment.createdAt.toISOString(),
  };
}

export function toNotification(notification: PrismaNotification & { patient?: User | null }): Notification {
  return {
    id: notification.id,
    patientId: notification.patientId,
    patientName: notification.patient?.name ?? null,
    channel: notification.channel,
    type: notification.type,
    recipient: notification.recipient,
    subject: notification.subject,
    body: notification.body,
    status: notification.status,
    error: notification.error,
    providerMessageId: notification.providerMessageId,
    createdAt: notification.createdAt.toISOString(),
  };
}

// ---- Attachments ----

export function toAttachment(attachment: PrismaAttachment & { uploadedBy?: User }): Attachment {
  return {
    id: attachment.id,
    patientId: attachment.patientId,
    category: attachment.category,
    entityId: attachment.entityId,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    uploadedById: attachment.uploadedById,
    uploadedByName: attachment.uploadedBy?.name,
    createdAt: attachment.createdAt.toISOString(),
  };
}

// ---- Subscription billing ----

export function toSubscription(sub: PrismaSubscription): Subscription {
  return {
    id: sub.id,
    clinicId: sub.clinicId,
    tier: sub.tier as ClinicTier,
    billingCycle: sub.billingCycle,
    status: sub.status,
    amount: sub.amount,
    currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
    createdAt: sub.createdAt.toISOString(),
    updatedAt: sub.updatedAt.toISOString(),
    isActive: isSubscriptionActive(sub),
  };
}

export function toSubscriptionPayment(
  payment: PrismaSubscriptionPayment & { recordedByAdmin?: PlatformAdmin | null; paidByUser?: User | null },
): SubscriptionPayment {
  return {
    id: payment.id,
    subscriptionId: payment.subscriptionId,
    amount: payment.amount,
    billingCycle: payment.billingCycle,
    periodStart: payment.periodStart.toISOString(),
    periodEnd: payment.periodEnd.toISOString(),
    recordedAt: payment.recordedAt.toISOString(),
    recordedByAdminName: payment.recordedByAdmin?.name ?? null,
    paidByUserName: payment.paidByUser?.name ?? null,
    notes: payment.notes,
  };
}

export function toClinicWithSubscription(clinic: Clinic & { subscription: PrismaSubscription }): ClinicWithSubscription {
  return {
    id: clinic.id,
    slug: clinic.slug,
    name: clinic.name,
    tier: clinic.tier as ClinicTier,
    createdAt: clinic.createdAt.toISOString(),
    subscription: toSubscription(clinic.subscription),
  };
}
