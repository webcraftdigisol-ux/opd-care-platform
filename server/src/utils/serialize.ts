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

export function toConsultation(
  c: PrismaConsultation & { prescriptions?: PrismaPrescription[]; labTestsOrdered?: PrismaLabTestOrder[] },
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
  };
}

type AppointmentWithRelations = PrismaAppointment & {
  patient?: User;
  doctor?: PrismaDoctorProfile & { user: User };
  consultation?:
    | (PrismaConsultation & { prescriptions?: PrismaPrescription[]; labTestsOrdered?: PrismaLabTestOrder[] })
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
    recordedById: invoice.recordedById,
    taxPercent: invoice.taxPercent,
    subtotal: invoice.subtotal,
    taxAmount: invoice.taxAmount,
    total: invoice.total,
    createdAt: invoice.createdAt.toISOString(),
    items: (invoice.items ?? []).map(toLabResultItem),
  };
}
