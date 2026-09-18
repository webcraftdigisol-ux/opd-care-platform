import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../prisma';
import { toAppointment, toDoctorProfile, toSchedule } from '../utils/serialize';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole } from '../middleware/auth';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('ADMIN'));

const createDoctorSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(6).optional(),
  password: z.string().min(6),
  specialization: z.string().min(2),
  department: z.string().min(2),
  slotMinutes: z.number().int().positive().optional(),
});

adminRouter.post(
  '/doctors',
  asyncHandler(async (req, res) => {
    const data = createDoctorSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new HttpError(409, 'An account with this email already exists');

    const password = await bcrypt.hash(data.password, 10);
    const doctor = await prisma.doctorProfile.create({
      data: {
        specialization: data.specialization,
        department: data.department,
        slotMinutes: data.slotMinutes ?? 15,
        user: {
          create: {
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
});

adminRouter.put(
  '/doctors/:id',
  asyncHandler(async (req, res) => {
    const data = updateDoctorSchema.parse(req.body);
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
  asyncHandler(async (req, res) => {
    const data = scheduleSchema.parse(req.body);
    const doctor = await prisma.doctorProfile.findUnique({ where: { id: req.params.id } });
    if (!doctor) throw new HttpError(404, 'Doctor not found');

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

adminRouter.get(
  '/appointments',
  asyncHandler(async (req, res) => {
    const dateStr = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0, 10);
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    const appointments = await prisma.appointment.findMany({
      where: { date },
      include: {
        patient: true,
        doctor: { include: { user: true } },
        consultation: { include: { prescriptions: true } },
      },
      orderBy: [{ doctorId: 'asc' }, { tokenNumber: 'asc' }],
    });
    res.json(appointments.map(toAppointment));
  }),
);
