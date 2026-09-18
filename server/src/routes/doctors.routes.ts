import { Router } from 'express';
import { prisma } from '../prisma';
import { toDoctorProfile, toSchedule } from '../utils/serialize';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';

export const doctorsRouter = Router();

doctorsRouter.use(requireAuth);

doctorsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const doctors = await prisma.doctorProfile.findMany({
      include: { user: true },
      orderBy: { user: { name: 'asc' } },
    });
    res.json(doctors.map(toDoctorProfile));
  }),
);

doctorsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const doctor = await prisma.doctorProfile.findUnique({
      where: { id: req.params.id },
      include: { user: true },
    });
    if (!doctor) throw new HttpError(404, 'Doctor not found');
    res.json(toDoctorProfile(doctor));
  }),
);

doctorsRouter.get(
  '/:id/schedule',
  asyncHandler(async (req, res) => {
    const schedules = await prisma.schedule.findMany({
      where: { doctorId: req.params.id },
      orderBy: { dayOfWeek: 'asc' },
    });
    res.json(schedules.map(toSchedule));
  }),
);
