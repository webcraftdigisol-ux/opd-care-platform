import { Router } from 'express';
import { z } from 'zod';
import type { BillType, PatientBill, PatientBillingResponse, PatientSearchResult } from '@opd/shared';
import { ROLES_BY_BILL_TYPE } from './payments.routes';
import { prisma } from '../prisma';
import {
  toAppointment,
  toPharmacySale,
  toLabInvoice,
  toRadiologyInvoice,
  toPublicUser,
  toAttachment,
  toDietPlan,
  patientWithCode,
} from '../utils/serialize';
import {
  createPatient,
  ensurePatientProfile,
  isPlaceholderEmail,
  joinName,
  normalizePhone,
  patientSearchWhere,
  placeholderEmail,
  profileFields,
  toPatient,
  toPatientSearchResult,
} from '../utils/patients';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth';

export const patientsRouter = Router();

patientsRouter.use(requireAuth);

const STAFF_ROLES = [
  'DOCTOR',
  'ADMIN',
  'RECEPTIONIST',
  'PHARMACIST',
  'LAB_TECHNICIAN',
  'RADIOLOGY_TECHNICIAN',
  'NURSE',
  'HEAD_NURSE',
] as const;
// Who registers patients and edits their details.
const REGISTRATION_ROLES = ['ADMIN', 'RECEPTIONIST', 'DOCTOR'] as const;

// Used by the pharmacy/lab/radiology/IPD patient pickers.
patientsRouter.get(
  '/',
  requireRole(...STAFF_ROLES),
  asyncHandler(async (req: AuthedRequest, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const clinicId = req.auth!.clinicId;
    const patients = await prisma.user.findMany({
      where: search ? patientSearchWhere(clinicId, search) : { clinicId, role: 'PATIENT' },
      include: patientWithCode.include,
      orderBy: { name: 'asc' },
      take: 50,
    });
    res.json(patients.map(toPublicUser));
  }),
);

// The as-you-type search (Find Patient, dashboard, booking): name
// anywhere, any case; mobile digits however typed; Patient ID with or
// without "PT". Each row carries enough (age/sex, ID, mobile, last visit)
// to tell family members sharing a number apart.
patientsRouter.get(
  '/search',
  requireRole(...STAFF_ROLES),
  asyncHandler(async (req: AuthedRequest, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) return res.json([]);
    const clinicId = req.auth!.clinicId;
    const users = await prisma.user.findMany({
      where: patientSearchWhere(clinicId, q),
      include: { patientProfile: true },
      orderBy: { name: 'asc' },
      take: 20,
    });
    const lastVisits = await prisma.appointment.groupBy({
      by: ['patientId'],
      where: { clinicId, patientId: { in: users.map((u) => u.id) }, status: { not: 'CANCELLED' } },
      _max: { date: true },
    });
    const lastVisit = new Map(lastVisits.map((v) => [v.patientId, v._max.date]));
    const results: PatientSearchResult[] = users.map((u) => toPatientSearchResult(u, lastVisit.get(u.id) ?? null));
    res.json(results);
  }),
);

// Newest registrations first, for the dashboard.
patientsRouter.get(
  '/recent',
  requireRole(...STAFF_ROLES),
  asyncHandler(async (req: AuthedRequest, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 50);
    const users = await prisma.user.findMany({
      where: { clinicId: req.auth!.clinicId, role: 'PATIENT' },
      include: { patientProfile: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json(users.map((u) => toPatientSearchResult(u, null)));
  }),
);

const optionalText = z.string().max(2000).nullish();
const patientDetailsSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100),
  middleName: optionalText,
  lastName: optionalText,
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).nullish(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD')
    .refine((d) => !Number.isNaN(Date.parse(d)) && new Date(d) <= new Date(), 'Date of birth is not valid')
    .nullish()
    .or(z.literal('').transform(() => null)),
  ageYears: z.number().int().min(0).max(130).nullish(),
  bloodGroup: optionalText,
  maritalStatus: optionalText,
  nationality: optionalText,
  phone: z.string().trim().min(6, 'Mobile number is required').max(20),
  alternatePhone: optionalText,
  email: z.string().trim().email().nullish().or(z.literal('').transform(() => null)),
  emergencyContact: optionalText,
  occupation: optionalText,
  referredBy: optionalText,
  address: optionalText,
  city: optionalText,
  state: optionalText,
  pincode: optionalText,
  heightCm: z.number().positive().max(300).nullish(),
  weightKg: z.number().positive().max(500).nullish(),
  allergies: optionalText,
  chronicDiseases: optionalText,
  pastSurgeries: optionalText,
  familyHistory: optionalText,
  insuranceDetails: optionalText,
  tpa: optionalText,
  doctorNotes: optionalText,
  whatsappOptIn: z.boolean().optional(),
});

async function assertEmailFree(clinicId: string, email: string | null | undefined, exceptUserId?: string) {
  if (!email) return;
  const taken = await prisma.user.findUnique({ where: { clinicId_email: { clinicId, email } } });
  if (taken && taken.id !== exceptUserId) {
    throw new HttpError(409, 'Another account at this clinic already uses this email');
  }
}

patientsRouter.post(
  '/',
  requireRole(...REGISTRATION_ROLES),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = patientDetailsSchema.parse(req.body);
    const clinicId = req.auth!.clinicId;
    await assertEmailFree(clinicId, data.email);
    const { user, profile } = await prisma.$transaction((tx) =>
      createPatient(tx, clinicId, data, { consentRecordedById: req.auth!.userId }),
    );
    res.status(201).json(toPatient(user, profile));
  }),
);

async function findPatient(req: AuthedRequest) {
  const isSelf = req.auth!.role === 'PATIENT' && req.auth!.userId === req.params.id;
  if (!isSelf && !(STAFF_ROLES as readonly string[]).includes(req.auth!.role)) {
    throw new HttpError(403, 'Not authorized to view this patient');
  }
  const user = await prisma.user.findFirst({
    where: { id: req.params.id, clinicId: req.auth!.clinicId, role: 'PATIENT' },
  });
  if (!user) throw new HttpError(404, 'Patient not found');
  return user;
}

patientsRouter.get(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await findPatient(req);
    const profile = await ensurePatientProfile(prisma, user);
    res.json(toPatient(user, profile));
  }),
);

patientsRouter.put(
  '/:id',
  requireRole(...REGISTRATION_ROLES),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = patientDetailsSchema.parse(req.body);
    const user = await findPatient(req);
    await ensurePatientProfile(prisma, user);
    await assertEmailFree(user.clinicId, data.email, user.id);

    const consent =
      data.whatsappOptIn && !user.whatsappOptIn
        ? { whatsappOptIn: true, whatsappOptInAt: new Date(), whatsappOptInRecordedById: req.auth!.userId }
        : {};
    const [updatedUser, profile] = await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          name: joinName(data.firstName, data.middleName, data.lastName),
          phone: normalizePhone(data.phone),
          // Clearing the email puts back a placeholder; the column is required.
          email: data.email ?? (isPlaceholderEmail(user.email) ? user.email : placeholderEmail()),
          ...consent,
        },
      }),
      prisma.patientProfile.update({ where: { userId: user.id }, data: profileFields(data) }),
    ]);
    res.json(toPatient(updatedUser, profile));
  }),
);

const round2 = (n: number) => Math.round(n * 100) / 100;

// Every bill for one patient with what's been paid against it -- the
// profile's Billing tab. Each bill type is shown only to the roles that can
// see that bill elsewhere (reception sees consultations, the pharmacist
// pharmacy sales, ...); admin and the patient themself see all of them.
patientsRouter.get(
  '/:id/billing',
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await findPatient(req);
    const clinicId = user.clinicId;
    const role = req.auth!.role;
    const canSee = (t: BillType) => role === 'PATIENT' || ROLES_BY_BILL_TYPE[t].includes(role);
    const where = { clinicId, patientId: user.id };

    const [appointments, sales, labs, rads, admissions, payments] = await Promise.all([
      canSee('CONSULTATION')
        ? prisma.appointment.findMany({ where, include: { doctor: { include: { user: true } } }, orderBy: { date: 'asc' } })
        : [],
      canSee('PHARMACY') ? prisma.pharmacySale.findMany({ where }) : [],
      canSee('LAB') ? prisma.labInvoice.findMany({ where }) : [],
      canSee('RADIOLOGY') ? prisma.radiologyInvoice.findMany({ where }) : [],
      canSee('IPD') ? prisma.admission.findMany({ where: { ...where, bill: { isNot: null } }, include: { bill: true } }) : [],
      prisma.payment.groupBy({ by: ['billType', 'billId'], where, _sum: { amount: true } }),
    ]);
    const paid = new Map(payments.map((p) => [`${p.billType}:${p.billId}`, p._sum.amount ?? 0]));

    const bills: PatientBill[] = [];
    const add = (billType: BillType, billId: string, label: string, date: Date, total: number) => {
      const amountPaid = round2(paid.get(`${billType}:${billId}`) ?? 0);
      bills.push({ billType, billId, label, date: date.toISOString(), total: round2(total), amountPaid, balanceDue: round2(total - amountPaid) });
    };

    // A visit is a bill once the patient has actually come in (or paid);
    // a future booking, a no-show or a cancellation isn't.
    let visit = 0;
    for (const a of appointments) {
      const attended = ['CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED'].includes(a.status);
      if (!attended && !paid.has(`CONSULTATION:${a.id}`)) continue;
      visit += 1;
      add('CONSULTATION', a.id, `OPD consultation — Visit ${visit} · ${/^dr\.?\s/i.test(a.doctor.user.name) ? '' : 'Dr. '}${a.doctor.user.name}`, a.date, a.consultationFee);
    }
    for (const s of sales) add('PHARMACY', s.id, 'Pharmacy', s.createdAt, s.total);
    for (const l of labs) add('LAB', l.id, 'Lab tests', l.createdAt, l.total);
    for (const r of rads) add('RADIOLOGY', r.id, 'Radiology', r.createdAt, r.total);
    for (const a of admissions) add('IPD', a.id, 'IPD admission', a.dischargedAt ?? a.admittedAt, Math.max(0, a.bill!.amountDue));

    bills.sort((x, y) => y.date.localeCompare(x.date));
    const response: PatientBillingResponse = {
      bills,
      totalBilled: round2(bills.reduce((n, b) => n + b.total, 0)),
      totalPaid: round2(bills.reduce((n, b) => n + b.amountPaid, 0)),
      totalDue: round2(bills.reduce((n, b) => n + Math.max(0, b.balanceDue), 0)),
    };
    res.json(response);
  }),
);

patientsRouter.get(
  '/:id/records',
  asyncHandler(async (req: AuthedRequest, res) => {
    const isSelf = req.auth!.role === 'PATIENT' && req.auth!.userId === req.params.id;
    // Clinical records are not for the front desk: a receptionist can see
    // and edit a patient's details, but not their visits and results.
    const isStaff = (STAFF_ROLES as readonly string[]).includes(req.auth!.role) && req.auth!.role !== 'RECEPTIONIST';
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

    const [pharmacySales, labInvoices, radiologyInvoices, attachments, dietPlans] = await Promise.all([
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
      prisma.attachment.findMany({
        where: { patientId: req.params.id, clinicId: req.auth!.clinicId },
        include: { uploadedBy: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.dietPlan.findMany({
        where: { patientId: req.params.id, clinicId: req.auth!.clinicId },
        include: { createdBy: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    res.json({
      patient: toPublicUser(patient),
      appointments: appointments.map(toAppointment),
      pharmacySales: pharmacySales.map(toPharmacySale),
      labInvoices: labInvoices.map(toLabInvoice),
      radiologyInvoices: radiologyInvoices.map(toRadiologyInvoice),
      attachments: attachments.map(toAttachment),
      dietPlans: dietPlans.map(toDietPlan),
    });
  }),
);
