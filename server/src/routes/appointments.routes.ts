import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../prisma';
import { toAppointment } from '../utils/serialize';
import { notifyPatientEmail } from '../utils/notify';
import { parseDateOnly } from '../utils/dates';
import { getAvailableSlots } from '../utils/availableSlots';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth';

export const appointmentsRouter = Router();

appointmentsRouter.use(requireAuth);

async function nextTokenNumber(clinicId: string, doctorId: string, date: Date): Promise<number> {
  const count = await prisma.appointment.count({
    where: { clinicId, doctorId, date, status: { not: 'CANCELLED' } },
  });
  return count + 1;
}

async function assertDoctorInClinic(clinicId: string, doctorId: string, date: Date) {
  const doctor = await prisma.doctorProfile.findFirst({ where: { id: doctorId, user: { clinicId } } });
  if (!doctor) throw new HttpError(404, 'Doctor not found');
  const dayOfWeek = date.getUTCDay();
  const schedule = await prisma.schedule.findFirst({ where: { doctorId, dayOfWeek } });
  if (!schedule) {
    throw new HttpError(400, 'Doctor is not available on the selected day');
  }
  return doctor;
}

const bookSchema = z.object({
  doctorId: z.string().min(1),
  date: z.string().min(1),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time, expected HH:mm'),
  reason: z.string().optional(),
});

appointmentsRouter.post(
  '/',
  requireRole('PATIENT'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = bookSchema.parse(req.body);
    const clinicId = req.auth!.clinicId;
    const date = parseDateOnly(data.date);
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    if (date < startOfToday) {
      throw new HttpError(400, 'Cannot book an appointment in the past');
    }
    const doctor = await assertDoctorInClinic(clinicId, data.doctorId, date);

    // Validated against the exact same slot computation GET /doctors/:id/slots
    // returns to the UI, so "bookable" and "booked" can never drift apart.
    const slots = await getAvailableSlots(data.doctorId, date, doctor.slotMinutes);
    const slot = slots.find((s) => s.startTime === data.startTime);
    if (!slot || !slot.available) {
      throw new HttpError(400, 'That time slot is not available -- please pick another');
    }

    const appointment = await prisma.$transaction(async (tx) => {
      // Re-check inside the transaction as the actual double-booking guard
      // (the same check-then-write pattern used for bed occupancy in
      // ipd.routes.ts admitPatient, not a DB-level constraint -- a CANCELLED
      // appointment must free its slot for someone else to rebook, and
      // Postgres has no partial-unique support through Prisma's schema DSL).
      const conflict = await tx.appointment.findFirst({
        where: { doctorId: data.doctorId, date, startTime: data.startTime, status: { not: 'CANCELLED' } },
      });
      if (conflict) {
        throw new HttpError(409, 'That time slot was just taken -- please pick another');
      }
      const tokenNumber = await nextTokenNumber(clinicId, data.doctorId, date);
      return tx.appointment.create({
        data: {
          clinicId,
          patientId: req.auth!.userId,
          doctorId: data.doctorId,
          date,
          tokenNumber,
          startTime: data.startTime,
          reason: data.reason,
          consultationFee: doctor.consultationFee,
        },
        include: { patient: true, doctor: { include: { user: true } } },
      });
    });

    await notifyPatientEmail({
      clinicId,
      patientId: appointment.patientId,
      type: 'APPOINTMENT_CONFIRMED',
      to: appointment.patient.email,
      subject: `Appointment confirmed — Token #${appointment.tokenNumber}`,
      body: `Hi ${appointment.patient.name}, your appointment with Dr. ${appointment.doctor.user.name} on ${appointment.date.toISOString().slice(0, 10)} at ${appointment.startTime} is confirmed. Your token number is #${appointment.tokenNumber}.`,
    });

    res.status(201).json(toAppointment(appointment));
  }),
);

appointmentsRouter.get(
  '/mine',
  requireRole('PATIENT'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const appointments = await prisma.appointment.findMany({
      where: { clinicId: req.auth!.clinicId, patientId: req.auth!.userId },
      include: {
        doctor: { include: { user: true } },
        consultation: { include: { prescriptions: true, labTestsOrdered: true, radiologyOrdered: true } },
      },
      // startTime asc puts slotted bookings in visit order; Postgres sorts
      // NULLs last on ASC by default, so same-day walk-ins (no startTime)
      // fall after them, broken by booking order via tokenNumber.
      orderBy: [{ date: 'desc' }, { startTime: 'asc' }, { tokenNumber: 'asc' }],
    });
    res.json(appointments.map(toAppointment));
  }),
);

const queueQuerySchema = z.object({
  doctorId: z.string().optional(),
  date: z.string().optional(),
});

appointmentsRouter.get(
  '/queue',
  requireRole('DOCTOR', 'ADMIN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const query = queueQuerySchema.parse(req.query);
    const clinicId = req.auth!.clinicId;
    let doctorId = query.doctorId;
    if (req.auth!.role === 'DOCTOR') {
      const doctor = await prisma.doctorProfile.findUnique({ where: { userId: req.auth!.userId } });
      if (!doctor) throw new HttpError(404, 'Doctor profile not found for this account');
      doctorId = doctor.id;
    }
    if (!doctorId) throw new HttpError(400, 'doctorId is required');
    const date = parseDateOnly(query.date ?? new Date().toISOString().slice(0, 10));

    const appointments = await prisma.appointment.findMany({
      where: { clinicId, doctorId, date },
      include: {
        patient: true,
        doctor: { include: { user: true } },
        consultation: { include: { prescriptions: true, labTestsOrdered: true, radiologyOrdered: true } },
      },
      orderBy: [{ startTime: 'asc' }, { tokenNumber: 'asc' }],
    });
    res.json(appointments.map(toAppointment));
  }),
);

const statusSchema = z.object({
  status: z.enum(['BOOKED', 'CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
});

appointmentsRouter.get(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const appointment = await prisma.appointment.findFirst({
      where: { id: req.params.id, clinicId: req.auth!.clinicId },
      include: {
        patient: true,
        doctor: { include: { user: true } },
        consultation: { include: { prescriptions: true, labTestsOrdered: true, radiologyOrdered: true } },
      },
    });
    if (!appointment) throw new HttpError(404, 'Appointment not found');

    if (req.auth!.role === 'PATIENT' && appointment.patientId !== req.auth!.userId) {
      throw new HttpError(403, 'Not your appointment');
    }
    if (req.auth!.role === 'DOCTOR') {
      const doctor = await prisma.doctorProfile.findUnique({ where: { userId: req.auth!.userId } });
      if (!doctor || doctor.id !== appointment.doctorId) {
        throw new HttpError(403, 'Not your appointment');
      }
    }

    res.json(toAppointment(appointment));
  }),
);

appointmentsRouter.patch(
  '/:id/status',
  requireRole('DOCTOR', 'ADMIN', 'RECEPTIONIST'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { status } = statusSchema.parse(req.body);
    const appointment = await prisma.appointment.findFirst({
      where: { id: req.params.id, clinicId: req.auth!.clinicId },
    });
    if (!appointment) throw new HttpError(404, 'Appointment not found');

    if (req.auth!.role === 'DOCTOR') {
      const doctor = await prisma.doctorProfile.findUnique({ where: { userId: req.auth!.userId } });
      if (!doctor || doctor.id !== appointment.doctorId) {
        throw new HttpError(403, 'Not your appointment');
      }
    }

    const updated = await prisma.appointment.update({
      where: { id: req.params.id },
      data: { status },
      include: {
        patient: true,
        doctor: { include: { user: true } },
        consultation: { include: { prescriptions: true, labTestsOrdered: true, radiologyOrdered: true } },
      },
    });
    res.json(toAppointment(updated));
  }),
);

appointmentsRouter.post(
  '/:id/cancel',
  requireRole('PATIENT'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const appointment = await prisma.appointment.findFirst({
      where: { id: req.params.id, clinicId: req.auth!.clinicId },
    });
    if (!appointment) throw new HttpError(404, 'Appointment not found');
    if (appointment.patientId !== req.auth!.userId) throw new HttpError(403, 'Not your appointment');
    if (appointment.status !== 'BOOKED') {
      throw new HttpError(400, 'Only a booked appointment can be cancelled');
    }
    const updated = await prisma.appointment.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' },
      include: { patient: true, doctor: { include: { user: true } } },
    });
    res.json(toAppointment(updated));
  }),
);

const walkInSchema = z.object({
  doctorId: z.string().min(1),
  patientName: z.string().min(2),
  patientPhone: z.string().min(6),
  reason: z.string().optional(),
  whatsappOptIn: z.boolean().optional(),
});

appointmentsRouter.post(
  '/walk-in',
  requireRole('ADMIN', 'RECEPTIONIST'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = walkInSchema.parse(req.body);
    const clinicId = req.auth!.clinicId;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const doctor = await assertDoctorInClinic(clinicId, data.doctorId, today);

    // The front desk recording the patient's in-person WhatsApp consent --
    // Meta accepts consent collected offline as long as it's recorded, and
    // this keeps who recorded it and when. Only ever turns consent on;
    // leaving the box unticked never revokes an earlier opt-in.
    const consent = data.whatsappOptIn
      ? { whatsappOptIn: true, whatsappOptInAt: new Date(), whatsappOptInRecordedById: req.auth!.userId }
      : {};

    let patient = await prisma.user.findUnique({
      where: { clinicId_phone: { clinicId, phone: data.patientPhone } },
    });
    if (!patient) {
      const randomPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
      patient = await prisma.user.create({
        data: {
          clinicId,
          name: data.patientName,
          email: `walkin-${data.patientPhone}@opd.local`,
          phone: data.patientPhone,
          password: randomPassword,
          role: 'PATIENT',
          ...consent,
        },
      });
    } else if (data.whatsappOptIn && !patient.whatsappOptIn) {
      patient = await prisma.user.update({ where: { id: patient.id }, data: consent });
    }

    const appointment = await prisma.$transaction(async (tx) => {
      const tokenNumber = await nextTokenNumber(clinicId, data.doctorId, today);
      return tx.appointment.create({
        data: {
          clinicId,
          patientId: patient!.id,
          doctorId: data.doctorId,
          date: today,
          tokenNumber,
          reason: data.reason,
          isWalkIn: true,
          status: 'CHECKED_IN',
          consultationFee: doctor.consultationFee,
        },
        include: { patient: true, doctor: { include: { user: true } } },
      });
    });

    // Walk-ins are usually registered by phone only (a synthetic
    // walkin-<phone>@opd.local email is used as the account placeholder),
    // so this correctly ends up SKIPPED for most walk-ins -- notifyPatientEmail
    // filters that placeholder out rather than sending to it.
    await notifyPatientEmail({
      clinicId,
      patientId: appointment.patientId,
      type: 'APPOINTMENT_CONFIRMED',
      to: appointment.patient.email,
      subject: `Appointment confirmed — Token #${appointment.tokenNumber}`,
      body: `Hi ${appointment.patient.name}, you're checked in with Dr. ${appointment.doctor.user.name}. Your token number is #${appointment.tokenNumber}.`,
    });

    res.status(201).json(toAppointment(appointment));
  }),
);
