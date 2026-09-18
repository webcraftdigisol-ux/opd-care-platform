import { Router } from 'express';
import { prisma } from '../prisma';
import { toAppointment, toPharmacySale, toLabInvoice, toRadiologyInvoice, toPublicUser } from '../utils/serialize';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth';

export const patientsRouter = Router();

patientsRouter.use(requireAuth);

patientsRouter.get(
  '/',
  requireRole('DOCTOR', 'ADMIN', 'PHARMACIST', 'LAB_TECHNICIAN', 'RADIOLOGY_TECHNICIAN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const patients = await prisma.user.findMany({
      where: {
        clinicId: req.auth!.clinicId,
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
    const isStaff = ['DOCTOR', 'ADMIN', 'PHARMACIST', 'LAB_TECHNICIAN', 'RADIOLOGY_TECHNICIAN'].includes(
      req.auth!.role,
    );
    if (!isSelf && !isStaff) {
      throw new HttpError(403, 'Not authorized to view these records');
    }

    const patient = await prisma.user.findFirst({
      where: { id: req.params.id, clinicId: req.auth!.clinicId },
    });
    if (!patient || patient.role !== 'PATIENT') throw new HttpError(404, 'Patient not found');

    const appointments = await prisma.appointment.findMany({
      where: { patientId: req.params.id, clinicId: req.auth!.clinicId },
      include: {
        doctor: { include: { user: true } },
        consultation: { include: { prescriptions: true, labTestsOrdered: true, radiologyOrdered: true } },
      },
      orderBy: { date: 'desc' },
    });

    const [pharmacySales, labInvoices, radiologyInvoices] = await Promise.all([
      prisma.pharmacySale.findMany({
        where: { patientId: req.params.id, clinicId: req.auth!.clinicId },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.labInvoice.findMany({
        where: { patientId: req.params.id, clinicId: req.auth!.clinicId },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.radiologyInvoice.findMany({
        where: { patientId: req.params.id, clinicId: req.auth!.clinicId },
        include: { items: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    res.json({
      patient: toPublicUser(patient),
      appointments: appointments.map(toAppointment),
      pharmacySales: pharmacySales.map(toPharmacySale),
      labInvoices: labInvoices.map(toLabInvoice),
      radiologyInvoices: radiologyInvoices.map(toRadiologyInvoice),
    });
  }),
);
