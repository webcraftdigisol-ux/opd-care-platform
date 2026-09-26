import { Router } from 'express';
import { z } from 'zod';
import type { DoctorProfile, MedicalCertificate as PrismaCertificate, User } from '@prisma/client';
import type { CertificatePrint, Gender, MedicalCertificate } from '@opd/shared';
import { prisma } from '../prisma';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth';
import { currentAge } from '../utils/patients';
import { receiptNo } from '../utils/departments';

// Certificates a doctor issues to a patient -- medical fitness, sick
// leave, fitness to resume work, fitness to travel, or a general medical
// certificate -- printed on the clinic's letterhead. Every tier.
export const certificatesRouter = Router();

certificatesRouter.use(requireAuth, requireRole('ADMIN', 'DOCTOR'));

type WithDoctor = PrismaCertificate & { doctor: DoctorProfile & { user: User } };
const withDoctor = { doctor: { include: { user: true } } } as const;
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function toCertificate(c: WithDoctor): MedicalCertificate {
  return {
    id: c.id,
    certificateNo: receiptNo('MC', c.issuedAt, c.id),
    patientId: c.patientId,
    type: c.type,
    doctorId: c.doctorId,
    doctorName: c.doctor.user.name,
    diagnosis: c.diagnosis,
    fromDate: day(c.fromDate),
    toDate: day(c.toDate),
    purpose: c.purpose,
    body: c.body,
    issuedAt: c.issuedAt.toISOString(),
  };
}

const text = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => v?.trim() || null);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullish()
  .transform((v) => (v ? new Date(`${v}T00:00:00Z`) : null));

const certificateSchema = z
  .object({
    patientId: z.string().min(1),
    type: z.enum(['MEDICAL_FITNESS', 'SICK_LEAVE', 'FIT_TO_RESUME', 'FIT_TO_TRAVEL', 'GENERAL']),
    doctorId: z.string().optional(),
    diagnosis: text(300),
    fromDate: date,
    toDate: date,
    purpose: text(300),
    body: z.string().trim().min(1, 'The certificate text is empty').max(5000),
  })
  .refine((d) => !d.fromDate || !d.toDate || d.fromDate <= d.toDate, { message: 'The "to" date is before the "from" date', path: ['toDate'] });

certificatesRouter.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const patientId = z.string().min(1).parse(req.query.patientId);
    const certificates = await prisma.medicalCertificate.findMany({
      where: { patientId, clinicId: req.auth!.clinicId },
      include: withDoctor,
      orderBy: { issuedAt: 'desc' },
    });
    res.json(certificates.map(toCertificate));
  }),
);

certificatesRouter.post(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = certificateSchema.parse(req.body);
    const clinicId = req.auth!.clinicId;
    const patient = await prisma.user.findFirst({ where: { id: data.patientId, clinicId, role: 'PATIENT' } });
    if (!patient) throw new HttpError(404, 'Patient not found');
    // A doctor signs their own certificates; admin picks the doctor.
    const doctor =
      req.auth!.role === 'DOCTOR'
        ? await prisma.doctorProfile.findUnique({ where: { userId: req.auth!.userId } })
        : data.doctorId
          ? await prisma.doctorProfile.findFirst({ where: { id: data.doctorId, user: { clinicId } } })
          : null;
    if (!doctor) throw new HttpError(400, 'Choose the doctor issuing this certificate');
    const { doctorId: _doctorId, ...fields } = data;
    const certificate = await prisma.medicalCertificate.create({
      data: { ...fields, clinicId, doctorId: doctor.id },
      include: withDoctor,
    });
    res.status(201).json(toCertificate(certificate));
  }),
);

// The printable certificate.
certificatesRouter.get(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const c = await prisma.medicalCertificate.findFirst({
      where: { id: req.params.id, clinicId: req.auth!.clinicId },
      include: { ...withDoctor, patient: { include: { patientProfile: true } }, clinic: true },
    });
    if (!c) throw new HttpError(404, 'Certificate not found');
    const profile = c.patient.patientProfile;
    const response: CertificatePrint = {
      ...toCertificate(c),
      clinic: { name: c.clinic.name, address: c.clinic.address, phone: c.clinic.phone },
      patient: {
        name: c.patient.name,
        patientCode: profile?.patientCode ?? null,
        age: profile ? currentAge(profile) : null,
        gender: (profile?.gender as Gender | null) ?? null,
      },
      doctorQualification: c.doctor.qualification,
      doctorRegistrationNumber: c.doctor.registrationNumber,
    };
    res.json(response);
  }),
);
