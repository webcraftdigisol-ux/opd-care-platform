import { Router } from 'express';
import { z } from 'zod';
import type { ConsentForm as PrismaConsent, DoctorProfile, User } from '@prisma/client';
import type { ConsentForm, ConsentFormPrint, Gender } from '@opd/shared';
import { prisma } from '../prisma';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole, requireTier, type AuthedRequest } from '../middleware/auth';
import { currentAge } from '../utils/patients';

// Informed consent for procedures and surgery on admitted patients
// (Tier 3): the doctor fills in what will be done and what was explained,
// the form is printed with the standard consent wording and signed on
// paper, then marked signed here (with the scan attached as a
// CONSENT_FORM attachment). A procedure can be recorded against it.
export const consentsRouter = Router();

consentsRouter.use(requireAuth, requireTier(3));

const READ = ['ADMIN', 'DOCTOR', 'NURSE', 'HEAD_NURSE'] as const;
const WRITE = ['ADMIN', 'DOCTOR'] as const;

type WithDoctor = PrismaConsent & { doctor: DoctorProfile & { user: User } };

function toConsent(c: WithDoctor): ConsentForm {
  return {
    id: c.id,
    admissionId: c.admissionId,
    kind: c.kind,
    procedureName: c.procedureName,
    doctorId: c.doctorId,
    doctorName: c.doctor.user.name,
    plannedAt: c.plannedAt?.toISOString() ?? null,
    anaesthesia: c.anaesthesia,
    purpose: c.purpose,
    risks: c.risks,
    alternatives: c.alternatives,
    signedAt: c.signedAt?.toISOString() ?? null,
    signedByName: c.signedByName,
    signerRelation: c.signerRelation,
    witnessName: c.witnessName,
    createdAt: c.createdAt.toISOString(),
  };
}

const withDoctor = { doctor: { include: { user: true } } } as const;
const text = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => v?.trim() || null);

const consentSchema = z.object({
  admissionId: z.string().min(1),
  kind: z.enum(['PROCEDURE', 'SURGERY', 'ANAESTHESIA', 'BLOOD_TRANSFUSION', 'HIGH_RISK']),
  procedureName: z.string().trim().min(1, 'Name the procedure or surgery').max(200),
  doctorId: z.string().min(1),
  plannedAt: z.string().datetime().nullish(),
  anaesthesia: text(100),
  purpose: text(2000),
  risks: text(4000),
  alternatives: text(2000),
});

consentsRouter.get(
  '/',
  requireRole(...READ),
  asyncHandler(async (req: AuthedRequest, res) => {
    const admissionId = z.string().min(1).parse(req.query.admissionId);
    const consents = await prisma.consentForm.findMany({
      where: { admissionId, clinicId: req.auth!.clinicId },
      include: withDoctor,
      orderBy: { createdAt: 'asc' },
    });
    res.json(consents.map(toConsent));
  }),
);

consentsRouter.post(
  '/',
  requireRole(...WRITE),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = consentSchema.parse(req.body);
    const clinicId = req.auth!.clinicId;
    const [admission, doctor] = await Promise.all([
      prisma.admission.findFirst({ where: { id: data.admissionId, clinicId } }),
      prisma.doctorProfile.findFirst({ where: { id: data.doctorId, user: { clinicId } } }),
    ]);
    if (!admission) throw new HttpError(404, 'Admission not found');
    if (admission.status !== 'ADMITTED') throw new HttpError(400, 'The patient has been discharged');
    if (!doctor) throw new HttpError(404, 'Doctor not found');
    const consent = await prisma.consentForm.create({
      data: { ...data, plannedAt: data.plannedAt ? new Date(data.plannedAt) : null, clinicId, createdById: req.auth!.userId },
      include: withDoctor,
    });
    res.status(201).json(toConsent(consent));
  }),
);

async function findConsent(req: AuthedRequest) {
  const consent = await prisma.consentForm.findFirst({ where: { id: req.params.id, clinicId: req.auth!.clinicId }, include: withDoctor });
  if (!consent) throw new HttpError(404, 'Consent form not found');
  return consent;
}

// The printable form.
consentsRouter.get(
  '/:id',
  requireRole(...READ),
  asyncHandler(async (req: AuthedRequest, res) => {
    const c = await findConsent(req);
    const [clinic, admission] = await Promise.all([
      prisma.clinic.findUniqueOrThrow({ where: { id: c.clinicId } }),
      prisma.admission.findUniqueOrThrow({
        where: { id: c.admissionId },
        include: { patient: { include: { patientProfile: true } }, bed: { include: { ward: true } } },
      }),
    ]);
    const profile = admission.patient.patientProfile;
    const response: ConsentFormPrint = {
      ...toConsent(c),
      clinic: { name: clinic.name, address: clinic.address, phone: clinic.phone },
      patient: {
        name: admission.patient.name,
        patientCode: profile?.patientCode ?? null,
        age: profile ? currentAge(profile) : null,
        gender: (profile?.gender as Gender | null) ?? null,
      },
      doctorQualification: c.doctor.qualification,
      doctorRegistrationNumber: c.doctor.registrationNumber,
      ward: admission.bed.ward.name,
      bed: admission.bed.label,
      admittedAt: admission.admittedAt.toISOString(),
    };
    res.json(response);
  }),
);

const signSchema = z.object({
  signedByName: z.string().trim().min(1, 'Who signed?').max(120),
  signerRelation: z.string().trim().min(1).max(60),
  witnessName: text(120),
});

// Recorded once the paper form has been signed.
consentsRouter.post(
  '/:id/sign',
  requireRole(...READ),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = signSchema.parse(req.body);
    const c = await findConsent(req);
    if (c.signedAt) throw new HttpError(409, 'This consent is already signed');
    const updated = await prisma.consentForm.update({ where: { id: c.id }, data: { ...data, signedAt: new Date() }, include: withDoctor });
    res.json(toConsent(updated));
  }),
);

// Only a form not yet signed can be withdrawn (a signed one is a record).
consentsRouter.delete(
  '/:id',
  requireRole(...WRITE),
  asyncHandler(async (req: AuthedRequest, res) => {
    const c = await findConsent(req);
    if (c.signedAt) throw new HttpError(409, 'A signed consent form cannot be deleted');
    await prisma.consentForm.delete({ where: { id: c.id } });
    res.status(204).end();
  }),
);
