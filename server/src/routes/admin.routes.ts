import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../prisma';
import { toAppointment, toDoctorProfile, toNotification, toPublicUser, toSchedule, patientWithCode } from '../utils/serialize';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { placeholderEmail } from '../utils/patients';
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
  qualification: z.string().trim().optional(),
  registrationNumber: z.string().trim().optional(),
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
        qualification: data.qualification || null,
        registrationNumber: data.registrationNumber || null,
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

const blankToNull = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null);
const updateDoctorSchema = z.object({
  specialization: z.string().min(2).optional(),
  department: z.string().min(2).optional(),
  slotMinutes: z.number().int().positive().optional(),
  consultationFee: z.number().nonnegative().optional(),
  qualification: z.string().nullish().transform(blankToNull),
  registrationNumber: z.string().nullish().transform(blankToNull),
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

const STAFF_ROLES = ['ADMIN', 'PHARMACIST', 'LAB_TECHNICIAN', 'RADIOLOGY_TECHNICIAN', 'RECEPTIONIST', 'NURSE', 'HEAD_NURSE'] as const;
const USERNAME = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,30}$/, 'Username: 3–30 lowercase letters, digits, dot, dash or underscore, no spaces')
  .refine((u) => /[a-z]/.test(u), 'Username needs at least one letter');

const createStaffSchema = z
  .object({
    name: z.string().trim().min(2),
    username: USERNAME.optional(),
    email: z.string().trim().email().optional().or(z.literal('').transform(() => undefined)),
    phone: z.string().trim().min(6).optional().or(z.literal('').transform(() => undefined)),
    password: z.string().min(6, 'Temporary password: at least 6 characters'),
    role: z.enum(STAFF_ROLES),
  })
  .refine((d) => d.username || d.email, { message: 'Give a username or an email to sign in with' });

async function assertSignInFree(clinicId: string, data: { username?: string; email?: string }) {
  if (data.username && (await prisma.user.findUnique({ where: { clinicId_username: { clinicId, username: data.username } } }))) {
    throw new HttpError(409, 'That username is already taken at this clinic');
  }
  if (data.email && (await prisma.user.findUnique({ where: { clinicId_email: { clinicId, email: data.email } } }))) {
    throw new HttpError(409, 'An account with this email already exists');
  }
}

adminRouter.post(
  '/staff',
  requireRole('ADMIN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createStaffSchema.parse(req.body);
    const clinicId = req.auth!.clinicId;
    await assertSignInFree(clinicId, data);
    const staff = await prisma.user.create({
      data: {
        clinicId,
        name: data.name,
        username: data.username ?? null,
        // Username-only staff get a placeholder email (never shown or mailed).
        email: data.email ?? placeholderEmail(),
        phone: data.phone,
        password: await bcrypt.hash(data.password, 10),
        role: data.role,
      },
    });
    res.status(201).json(toPublicUser(staff));
  }),
);

const STAFF_LIST_ROLES = ['DOCTOR', ...STAFF_ROLES] as const;

adminRouter.get(
  '/staff',
  requireRole('ADMIN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const staff = await prisma.user.findMany({
      where: { clinicId: req.auth!.clinicId, role: { in: [...STAFF_LIST_ROLES] } },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
    res.json(staff.map(toPublicUser));
  }),
);

async function findStaff(req: AuthedRequest) {
  const staff = await prisma.user.findFirst({
    where: { id: req.params.id, clinicId: req.auth!.clinicId, role: { in: [...STAFF_LIST_ROLES] } },
  });
  if (!staff) throw new HttpError(404, 'Staff account not found');
  return staff;
}

const updateStaffSchema = z.object({
  name: z.string().trim().min(2).optional(),
  role: z.enum(STAFF_ROLES).optional(),
  phone: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v === undefined ? undefined : v || null)),
  username: USERNAME.nullish(),
  active: z.boolean().optional(),
});

// Edit a staff account: name, role, phone, username, or switch it off.
// Guards keep the clinic from locking itself out: an admin can't
// deactivate or demote themself, and there's always an active admin left.
adminRouter.patch(
  '/staff/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = updateStaffSchema.parse(req.body);
    const staff = await findStaff(req);
    const isSelf = staff.id === req.auth!.userId;
    if (isSelf && data.active === false) throw new HttpError(400, "You can't deactivate your own account");
    if (isSelf && data.role && data.role !== staff.role) throw new HttpError(400, "You can't change your own role");
    if (data.role && data.role !== staff.role && staff.role === 'DOCTOR') {
      throw new HttpError(400, "A doctor's role can't be changed here -- add them again with the new role");
    }
    const losingAdmin = staff.role === 'ADMIN' && ((data.role && data.role !== 'ADMIN') || data.active === false);
    if (losingAdmin) {
      const otherAdmins = await prisma.user.count({
        where: { clinicId: staff.clinicId, role: 'ADMIN', active: true, id: { not: staff.id } },
      });
      if (otherAdmins === 0) throw new HttpError(400, 'The clinic needs at least one active admin');
    }
    if (data.username && data.username !== staff.username) await assertSignInFree(staff.clinicId, { username: data.username });

    const updated = await prisma.user.update({
      where: { id: staff.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.role !== undefined ? { role: data.role } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.username !== undefined ? { username: data.username } : {}),
        ...(data.active !== undefined ? { active: data.active } : {}),
      },
    });
    res.json(toPublicUser(updated));
  }),
);

// Admin sets a new temporary password for a staff member (who has
// forgotten theirs, or is starting on a shared desk login).
adminRouter.post(
  '/staff/:id/reset-password',
  requireRole('ADMIN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { password } = z.object({ password: z.string().min(6, 'At least 6 characters') }).parse(req.body);
    const staff = await findStaff(req);
    await prisma.user.update({ where: { id: staff.id }, data: { password: await bcrypt.hash(password, 10) } });
    res.json({ message: `Password reset for ${staff.name}` });
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
        patient: patientWithCode,
        doctor: { include: { user: true } },
        consultation: { include: { prescriptions: true, labTestsOrdered: true, radiologyOrdered: true } },
      },
      orderBy: [{ doctorId: 'asc' }, { startTime: 'asc' }, { tokenNumber: 'asc' }],
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
      include: { patient: patientWithCode },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(notifications.map(toNotification));
  }),
);
