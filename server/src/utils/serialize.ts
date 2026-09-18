import type { User, DoctorProfile as PrismaDoctorProfile, Schedule as PrismaSchedule, Appointment as PrismaAppointment, Consultation as PrismaConsultation, Prescription as PrismaPrescription } from '@prisma/client';
import type { PublicUser, DoctorProfile, Schedule, Appointment, Consultation, Prescription } from '@opd/shared';

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
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

export function toConsultation(c: PrismaConsultation & { prescriptions?: PrismaPrescription[] }): Consultation {
  return {
    id: c.id,
    appointmentId: c.appointmentId,
    vitals: (c.vitals as Consultation['vitals']) ?? null,
    diagnosis: c.diagnosis,
    notes: c.notes,
    createdAt: c.createdAt.toISOString(),
    prescriptions: (c.prescriptions ?? []).map(toPrescription),
  };
}

type AppointmentWithRelations = PrismaAppointment & {
  patient?: User;
  doctor?: PrismaDoctorProfile & { user: User };
  consultation?: (PrismaConsultation & { prescriptions?: PrismaPrescription[] }) | null;
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
