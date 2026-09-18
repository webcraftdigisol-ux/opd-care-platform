import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import {
  toAdmission,
  toAdmissionDetail,
  toBed,
  toCharge,
  toDoctorVisit,
  toIpdBill,
  toMedication,
  toProcedure,
  toVitalsRecord,
  toWard,
} from '../utils/serialize';
import { computeIpdBillFigures } from '../utils/ipdBilling';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole, requireTier, type AuthedRequest } from '../middleware/auth';

export const ipdRouter = Router();

ipdRouter.use(requireAuth, requireTier(3), requireRole('ADMIN', 'DOCTOR'));

const admissionDetailInclude = {
  patient: true,
  bed: { include: { ward: true } },
  admittingDoctor: { include: { user: true } },
  roomTransfers: { include: { fromBed: true, toBed: true }, orderBy: { transferredAt: 'asc' as const } },
  doctorVisits: { include: { doctor: { include: { user: true } } }, orderBy: { visitedAt: 'asc' as const } },
  procedures: { orderBy: { performedAt: 'asc' as const } },
  medications: { orderBy: { givenAt: 'asc' as const } },
  vitalsLogs: { include: { recordedBy: true }, orderBy: { recordedAt: 'asc' as const } },
  charges: { orderBy: { chargedAt: 'asc' as const } },
  pharmacySales: { include: { items: true, patient: true }, orderBy: { createdAt: 'asc' as const } },
  labInvoices: { include: { items: true, patient: true }, orderBy: { createdAt: 'asc' as const } },
  bill: true,
};

async function loadAdmissionOrThrow(clinicId: string, admissionId: string) {
  const admission = await prisma.admission.findFirst({
    where: { id: admissionId, clinicId },
    include: admissionDetailInclude,
  });
  if (!admission) throw new HttpError(404, 'Admission not found');
  return admission;
}

// ---- Wards & Beds ----

ipdRouter.get(
  '/wards',
  asyncHandler(async (req: AuthedRequest, res) => {
    const wards = await prisma.ward.findMany({
      where: { clinicId: req.auth!.clinicId },
      include: { beds: true },
      orderBy: { name: 'asc' },
    });
    res.json(wards.map(toWard));
  }),
);

const createWardSchema = z.object({ name: z.string().min(1) });

ipdRouter.post(
  '/wards',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = createWardSchema.parse(req.body);
    const ward = await prisma.ward.create({
      data: { name: data.name, clinicId: req.auth!.clinicId },
      include: { beds: true },
    });
    res.status(201).json(toWard(ward));
  }),
);

const bulkAddBedsSchema = z.object({
  startNumber: z.number().int().nonnegative(),
  count: z.number().int().positive().max(200),
  prefix: z.string().optional(),
  dailyRate: z.number().positive(),
});

ipdRouter.post(
  '/wards/:wardId/beds/bulk',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = bulkAddBedsSchema.parse(req.body);
    const ward = await prisma.ward.findFirst({ where: { id: req.params.wardId, clinicId: req.auth!.clinicId } });
    if (!ward) throw new HttpError(404, 'Ward not found');

    await prisma.bed.createMany({
      data: Array.from({ length: data.count }, (_, i) => ({
        wardId: ward.id,
        label: `${data.prefix ?? ''}${data.startNumber + i}`,
        dailyRate: data.dailyRate,
      })),
    });

    const updated = await prisma.ward.findUniqueOrThrow({ where: { id: ward.id }, include: { beds: true } });
    res.status(201).json(toWard(updated));
  }),
);

const updateBedSchema = z.object({
  dailyRate: z.number().positive().optional(),
  status: z.enum(['VACANT', 'OCCUPIED', 'MAINTENANCE']).optional(),
});

ipdRouter.put(
  '/beds/:bedId',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = updateBedSchema.parse(req.body);
    const bed = await prisma.bed.findFirst({
      where: { id: req.params.bedId, ward: { clinicId: req.auth!.clinicId } },
    });
    if (!bed) throw new HttpError(404, 'Bed not found');
    const updated = await prisma.bed.update({ where: { id: bed.id }, data });
    res.json(toBed(updated));
  }),
);

ipdRouter.get(
  '/beds/vacant',
  asyncHandler(async (req: AuthedRequest, res) => {
    const beds = await prisma.bed.findMany({
      where: { status: 'VACANT', ward: { clinicId: req.auth!.clinicId } },
      include: { ward: true },
      orderBy: [{ ward: { name: 'asc' } }, { label: 'asc' }],
    });
    res.json(beds.map((b) => ({ ...toBed(b), wardName: b.ward.name })));
  }),
);

// ---- Admissions ----

const admitSchema = z.object({
  patientId: z.string().min(1),
  bedId: z.string().min(1),
  admittingDoctorId: z.string().min(1),
  reason: z.string().optional(),
  depositAmount: z.number().nonnegative().optional(),
});

ipdRouter.post(
  '/admissions',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = admitSchema.parse(req.body);
    const clinicId = req.auth!.clinicId;

    const [patient, bed, doctor] = await Promise.all([
      prisma.user.findFirst({ where: { id: data.patientId, clinicId, role: 'PATIENT' } }),
      prisma.bed.findFirst({ where: { id: data.bedId, ward: { clinicId } } }),
      prisma.doctorProfile.findFirst({ where: { id: data.admittingDoctorId, user: { clinicId } } }),
    ]);
    if (!patient) throw new HttpError(404, 'Patient not found');
    if (!bed) throw new HttpError(404, 'Bed not found');
    if (bed.status !== 'VACANT') throw new HttpError(400, 'Bed is not vacant');
    if (!doctor) throw new HttpError(404, 'Doctor not found');

    const admission = await prisma.$transaction(async (tx) => {
      const created = await tx.admission.create({
        data: {
          clinicId,
          patientId: data.patientId,
          bedId: data.bedId,
          admittingDoctorId: data.admittingDoctorId,
          reason: data.reason,
          depositAmount: data.depositAmount ?? 0,
        },
        include: admissionDetailInclude,
      });
      await tx.bed.update({ where: { id: data.bedId }, data: { status: 'OCCUPIED' } });
      return created;
    });

    res.status(201).json(toAdmissionDetail(admission));
  }),
);

const listQuerySchema = z.object({ status: z.enum(['ADMITTED', 'DISCHARGED']).optional() });

ipdRouter.get(
  '/admissions',
  asyncHandler(async (req: AuthedRequest, res) => {
    const query = listQuerySchema.parse(req.query);
    const admissions = await prisma.admission.findMany({
      where: { clinicId: req.auth!.clinicId, status: query.status },
      include: {
        patient: true,
        bed: { include: { ward: true } },
        admittingDoctor: { include: { user: true } },
      },
      orderBy: { admittedAt: 'desc' },
    });
    res.json(admissions.map(toAdmission));
  }),
);

ipdRouter.get(
  '/admissions/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const admission = await loadAdmissionOrThrow(req.auth!.clinicId, req.params.id);
    res.json(toAdmissionDetail(admission));
  }),
);

const transferSchema = z.object({ toBedId: z.string().min(1) });

ipdRouter.post(
  '/admissions/:id/transfer',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = transferSchema.parse(req.body);
    const clinicId = req.auth!.clinicId;
    const admission = await prisma.admission.findFirst({ where: { id: req.params.id, clinicId } });
    if (!admission) throw new HttpError(404, 'Admission not found');
    if (admission.status !== 'ADMITTED') throw new HttpError(400, 'Patient is not currently admitted');

    const toBed = await prisma.bed.findFirst({ where: { id: data.toBedId, ward: { clinicId } } });
    if (!toBed) throw new HttpError(404, 'Bed not found');
    if (toBed.status !== 'VACANT') throw new HttpError(400, 'Target bed is not vacant');

    await prisma.$transaction([
      prisma.roomTransfer.create({
        data: { admissionId: admission.id, fromBedId: admission.bedId, toBedId: data.toBedId },
      }),
      prisma.bed.update({ where: { id: admission.bedId }, data: { status: 'VACANT' } }),
      prisma.bed.update({ where: { id: data.toBedId }, data: { status: 'OCCUPIED' } }),
      prisma.admission.update({ where: { id: admission.id }, data: { bedId: data.toBedId } }),
    ]);

    const updated = await loadAdmissionOrThrow(clinicId, admission.id);
    res.json(toAdmissionDetail(updated));
  }),
);

async function assertAdmitted(clinicId: string, admissionId: string) {
  const admission = await prisma.admission.findFirst({ where: { id: admissionId, clinicId } });
  if (!admission) throw new HttpError(404, 'Admission not found');
  if (admission.status !== 'ADMITTED') throw new HttpError(400, 'Patient has already been discharged');
  return admission;
}

const doctorVisitSchema = z.object({
  doctorId: z.string().min(1),
  notes: z.string().optional(),
  fee: z.number().nonnegative().optional(),
});

ipdRouter.post(
  '/admissions/:id/doctor-visits',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = doctorVisitSchema.parse(req.body);
    const admission = await assertAdmitted(req.auth!.clinicId, req.params.id);
    const doctor = await prisma.doctorProfile.findFirst({
      where: { id: data.doctorId, user: { clinicId: req.auth!.clinicId } },
    });
    if (!doctor) throw new HttpError(404, 'Doctor not found');

    const visit = await prisma.ipdDoctorVisit.create({
      data: {
        admissionId: admission.id,
        doctorId: data.doctorId,
        notes: data.notes,
        fee: data.fee ?? 0,
      },
      include: { doctor: { include: { user: true } } },
    });
    res.status(201).json(toDoctorVisit(visit));
  }),
);

const procedureSchema = z.object({
  name: z.string().min(1),
  notes: z.string().optional(),
  consentSigned: z.boolean(),
  fee: z.number().nonnegative().optional(),
});

ipdRouter.post(
  '/admissions/:id/procedures',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = procedureSchema.parse(req.body);
    const admission = await assertAdmitted(req.auth!.clinicId, req.params.id);
    const procedure = await prisma.ipdProcedure.create({
      data: {
        admissionId: admission.id,
        name: data.name,
        notes: data.notes,
        consentSigned: data.consentSigned,
        fee: data.fee ?? 0,
      },
    });
    res.status(201).json(toProcedure(procedure));
  }),
);

const medicationSchema = z.object({
  medicine: z.string().min(1),
  dosage: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative().optional(),
  source: z.enum(['CLINIC_SUPPLIED', 'PATIENT_OWN']),
});

ipdRouter.post(
  '/admissions/:id/medications',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = medicationSchema.parse(req.body);
    const admission = await assertAdmitted(req.auth!.clinicId, req.params.id);
    const medication = await prisma.ipdMedication.create({
      data: {
        admissionId: admission.id,
        medicine: data.medicine,
        dosage: data.dosage,
        quantity: data.quantity,
        unitPrice: data.source === 'CLINIC_SUPPLIED' ? (data.unitPrice ?? 0) : 0,
        source: data.source,
      },
    });
    res.status(201).json(toMedication(medication));
  }),
);

const vitalsSchema = z.object({
  pulse: z.number().optional(),
  bpSystolic: z.number().optional(),
  bpDiastolic: z.number().optional(),
  tempC: z.number().optional(),
  spo2: z.number().optional(),
});

ipdRouter.post(
  '/admissions/:id/vitals',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = vitalsSchema.parse(req.body);
    const admission = await assertAdmitted(req.auth!.clinicId, req.params.id);
    const vitals = await prisma.ipdVitals.create({
      data: { admissionId: admission.id, ...data, recordedById: req.auth!.userId },
      include: { recordedBy: true },
    });
    res.status(201).json(toVitalsRecord(vitals));
  }),
);

const chargeSchema = z.object({
  description: z.string().min(1),
  amount: z.number().positive(),
});

ipdRouter.post(
  '/admissions/:id/charges',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = chargeSchema.parse(req.body);
    const admission = await assertAdmitted(req.auth!.clinicId, req.params.id);
    const charge = await prisma.ipdCharge.create({
      data: { admissionId: admission.id, description: data.description, amount: data.amount },
    });
    res.status(201).json(toCharge(charge));
  }),
);

ipdRouter.get(
  '/admissions/:id/bill-preview',
  asyncHandler(async (req: AuthedRequest, res) => {
    const figures = await computeIpdBillFigures(req.auth!.clinicId, req.params.id, new Date());
    res.json(figures);
  }),
);

const dischargeSchema = z.object({ dischargeSummary: z.string().optional() });

ipdRouter.post(
  '/admissions/:id/discharge',
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = dischargeSchema.parse(req.body);
    const clinicId = req.auth!.clinicId;
    const admission = await assertAdmitted(clinicId, req.params.id);

    const dischargedAt = new Date();
    const figures = await computeIpdBillFigures(clinicId, admission.id, dischargedAt);

    await prisma.$transaction([
      prisma.admission.update({
        where: { id: admission.id },
        data: { status: 'DISCHARGED', dischargedAt, dischargeSummary: data.dischargeSummary },
      }),
      prisma.bed.update({ where: { id: admission.bedId }, data: { status: 'VACANT' } }),
      prisma.ipdBill.create({ data: { admissionId: admission.id, ...figures } }),
    ]);

    const updated = await loadAdmissionOrThrow(clinicId, admission.id);
    res.json(toAdmissionDetail(updated));
  }),
);

ipdRouter.get(
  '/admissions/:id/bill',
  asyncHandler(async (req: AuthedRequest, res) => {
    const admission = await prisma.admission.findFirst({
      where: { id: req.params.id, clinicId: req.auth!.clinicId },
      include: { bill: true },
    });
    if (!admission) throw new HttpError(404, 'Admission not found');
    if (!admission.bill) throw new HttpError(404, 'This admission has not been discharged yet');
    res.json(toIpdBill(admission.bill));
  }),
);
