import { Router } from 'express';
import { prisma } from '../prisma';
import { toAppointment, toPublicUser } from '../utils/serialize';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth';

export const patientsRouter = Router();

patientsRouter.use(requireAuth);

patientsRouter.get(
  '/',
  requireRole('DOCTOR', 'ADMIN'),
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const patients = await prisma.user.findMany({
      where: {
        role: 'PATIENT',
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
                { email: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: 50,
    });
    res.json(patients.map(toPublicUser));
  }),
);

patientsRouter.get(
  '/:id/records',
  asyncHandler(async (req: AuthedRequest, res) => {
    const isSelf = req.auth!.role === 'PATIENT' && req.auth!.userId === req.params.id;
    const isStaff = req.auth!.role === 'DOCTOR' || req.auth!.role === 'ADMIN';
    if (!isSelf && !isStaff) {
      throw new HttpError(403, 'Not authorized to view these records');
    }

    const patient = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!patient || patient.role !== 'PATIENT') throw new HttpError(404, 'Patient not found');

    const appointments = await prisma.appointment.findMany({
      where: { patientId: req.params.id },
      include: {
        doctor: { include: { user: true } },
        consultation: { include: { prescriptions: true } },
      },
      orderBy: { date: 'desc' },
    });

    res.json({
      patient: toPublicUser(patient),
      appointments: appointments.map(toAppointment),
    });
  }),
);
