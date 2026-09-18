import { Router } from 'express';
import { prisma } from '../prisma';
import { toDoctorProfile, toSchedule } from '../utils/serialize';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, type AuthedRequest } from '../middleware/auth';

export const doctorsRouter = Router();

doctorsRouter.use(requireAuth);

doctorsRouter.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const doctors = await prisma.doctorProfile.findMany({
      where: { user: { clinicId: req.auth!.clinicId } },
      include: { user: true },
      orderBy: { user: { name: 'asc' } },
    });
    res.json(doctors.map(toDoctorProfile));
  }),
);

doctorsRouter.get(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const doctor = await prisma.doctorProfile.findFirst({
      where: { id: req.params.id, user: { clinicId: req.auth!.clinicId } },
      include: { user: true },
    });
    if (!doctor) throw new HttpError(404, 'Doctor not found');
    res.json(toDoctorProfile(doctor));
  }),
);

doctorsRouter.get(
  '/:id/schedule',
  asyncHandler(async (req: AuthedRequest, res) => {
    const doctor = await prisma.doctorProfile.findFirst({
      where: { id: req.params.id, user: { clinicId: req.auth!.clinicId } },
    });
    if (!doctor) throw new HttpError(404, 'Doctor not found');
    const schedules = await prisma.schedule.findMany({
      where: { doctorId: doctor.id },
      orderBy: { dayOfWeek: 'asc' },
    });
    res.json(schedules.map(toSchedule));
  }),
);
