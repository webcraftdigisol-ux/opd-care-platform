import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../prisma';
import { toAppointment, toDoctorProfile, toNotification, toPublicUser, toSchedule } from '../utils/serialize';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth';

export const adminRouter = Router();

adminRouter.use(requireAuth);

const createDoctorSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(6).optional(),
  password: z.string().min(6),
  specialization: z.string().min(2),
  department: z.string().min(2),
  slotMinutes: z.number().int().positive().optional(),
  consultationFee: z.number().nonnegative().optional(),
});

adminRouter.post(
  '/doctors',
  requireRole('ADMIN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createDoctorSchema.parse(req.body);
    const clinicId = req.auth!.clinicId;
    const existing = await prisma.user.findUnique({
      where: { clinicId_email: { clinicId, email: data.email } },
    });
    if (existing) throw new HttpError(409, 'An account with this email already exists');

    const password = await bcrypt.hash(data.password, 10);
    const doctor = await prisma.doctorProfile.create({
      data: {
        specialization: data.specialization,
        department: data.department,
        slotMinutes: data.slotMinutes ?? 15,
        consultationFee: data.consultationFee ?? 0,
        user: {
          create: {
            clinicId,
            name: data.name,
            email: data.email,
            phone: data.phone,
            password,
            role: 'DOCTOR',
          },
        },
      },
      include: { user: true },
    });
    res.status(201).json(toDoctorProfile(doctor));
  }),
);

const updateDoctorSchema = z.object({
  specialization: z.string().min(2).optional(),
  department: z.string().min(2).optional(),
  slotMinutes: z.number().int().positive().optional(),
  consultationFee: z.number().nonnegative().optional(),
});

async function assertDoctorInClinic(clinicId: string, doctorId: string) {
  const doctor = await prisma.doctorProfile.findFirst({ where: { id: doctorId, user: { clinicId } } });
  if (!doctor) throw new HttpError(404, 'Doctor not found');
  return doctor;
}

adminRouter.put(
  '/doctors/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = updateDoctorSchema.parse(req.body);
    await assertDoctorInClinic(req.auth!.clinicId, req.params.id);
    const doctor = await prisma.doctorProfile.update({
      where: { id: req.params.id },
      data,
      include: { user: true },
    });
    res.json(toDoctorProfile(doctor));
  }),
);

const scheduleSchema = z.object({
  slots: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    }),
  ),
});

adminRouter.put(
  '/doctors/:id/schedule',
  requireRole('ADMIN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = scheduleSchema.parse(req.body);
    const doctor = await assertDoctorInClinic(req.auth!.clinicId, req.params.id);

    await prisma.$transaction([
      prisma.schedule.deleteMany({ where: { doctorId: doctor.id } }),
      prisma.schedule.createMany({
        data: data.slots.map((slot) => ({ ...slot, doctorId: doctor.id })),
      }),
    ]);

    const schedules = await prisma.schedule.findMany({
      where: { doctorId: doctor.id },
      orderBy: { dayOfWeek: 'asc' },
    });
    res.json(schedules.map(toSchedule));
  }),
);

const createStaffSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(6).optional(),
  password: z.string().min(6),
  role: z.enum([
    'PHARMACIST',
    'LAB_TECHNICIAN',
    'RADIOLOGY_TECHNICIAN',
    'RECEPTIONIST',
    'NURSE',
    'HEAD_NURSE',
  ]),
});

adminRouter.post(
  '/staff',
  requireRole('ADMIN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createStaffSchema.parse(req.body);
    const clinicId = req.auth!.clinicId;
    const existing = await prisma.user.findUnique({
      where: { clinicId_email: { clinicId, email: data.email } },
    });
    if (existing) throw new HttpError(409, 'An account with this email already exists');

    const password = await bcrypt.hash(data.password, 10);
    const staff = await prisma.user.create({
      data: {
        clinicId,
        name: data.name,
        email: data.email,
        phone: data.phone,
        password,
        role: data.role,
      },
    });
    res.status(201).json(toPublicUser(staff));
  }),
);

adminRouter.get(
  '/staff',
  requireRole('ADMIN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const staff = await prisma.user.findMany({
      where: {
        clinicId: req.auth!.clinicId,
        role: {
          in: [
            'DOCTOR',
            'ADMIN',
            'PHARMACIST',
            'LAB_TECHNICIAN',
            'RADIOLOGY_TECHNICIAN',
            'RECEPTIONIST',
            'NURSE',
            'HEAD_NURSE',
          ],
        },
      },
      orderBy: { name: 'asc' },
    });
    res.json(staff.map(toPublicUser));
  }),
);

adminRouter.get(
  '/appointments',
  requireRole('ADMIN', 'RECEPTIONIST'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const dateStr = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0, 10);
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    const appointments = await prisma.appointment.findMany({
      where: { clinicId: req.auth!.clinicId, date },
      include: {
        patient: true,
        doctor: { include: { user: true } },
        consultation: { include: { prescriptions: true, labTestsOrdered: true, radiologyOrdered: true } },
      },
      orderBy: [{ doctorId: 'asc' }, { tokenNumber: 'asc' }],
    });
    res.json(appointments.map(toAppointment));
  }),
);

adminRouter.get(
  '/notifications',
  requireRole('ADMIN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
    const notifications = await prisma.notification.findMany({
      where: { clinicId: req.auth!.clinicId, ...(patientId ? { patientId } : {}) },
      include: { patient: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(notifications.map(toNotification));
  }),
);
