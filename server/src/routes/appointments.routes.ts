import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../prisma';
import { toAppointment } from '../utils/serialize';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth';

export const appointmentsRouter = Router();

appointmentsRouter.use(requireAuth);

function parseDateOnly(dateStr: string): Date {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, 'Invalid date, expected YYYY-MM-DD');
  }
  return date;
}

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
}

const bookSchema = z.object({
  doctorId: z.string().min(1),
  date: z.string().min(1),
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
    await assertDoctorInClinic(clinicId, data.doctorId, date);

    const appointment = await prisma.$transaction(async (tx) => {
      const tokenNumber = await nextTokenNumber(clinicId, data.doctorId, date);
      return tx.appointment.create({
        data: {
          clinicId,
          patientId: req.auth!.userId,
          doctorId: data.doctorId,
          date,
          tokenNumber,
          reason: data.reason,
        },
        include: { patient: true, doctor: { include: { user: true } } },
      });
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
        consultation: { include: { prescriptions: true, labTestsOrdered: true } },
      },
      orderBy: [{ date: 'desc' }, { tokenNumber: 'asc' }],
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
        consultation: { include: { prescriptions: true, labTestsOrdered: true } },
      },
      orderBy: { tokenNumber: 'asc' },
    });
    res.json(appointments.map(toAppointment));
  }),
);

const statusSchema = z.object({
  status: z.enum(['BOOKED', 'CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
});

appointmentsRouter.patch(
  '/:id/status',
  requireRole('DOCTOR', 'ADMIN'),
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
        consultation: { include: { prescriptions: true, labTestsOrdered: true } },
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
});

appointmentsRouter.post(
  '/walk-in',
  requireRole('ADMIN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = walkInSchema.parse(req.body);
    const clinicId = req.auth!.clinicId;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await assertDoctorInClinic(clinicId, data.doctorId, today);

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
        },
      });
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
        },
        include: { patient: true, doctor: { include: { user: true } } },
      });
    });

    res.status(201).json(toAppointment(appointment));
  }),
);
