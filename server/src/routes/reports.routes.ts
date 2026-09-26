import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma';
import {
  computeDailyActivity,
  computeLabReport,
  computePharmacyReport,
  computeRadiologyReport,
  endOfDay,
} from '../utils/reports';
import { sendFollowUpReminder } from '../utils/reminders';
import { toNotification } from '../utils/serialize';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole, requireTier, type AuthedRequest } from '../middleware/auth';
import type { Department, DepartmentReport, DoctorShareReport, OrdersReport, ProfitShareRate, Role } from '@opd/shared';
import { computeDepartmentReport, computeDoctorShare } from '../utils/departmentLines';
import { computeOrdersReport } from '../utils/ordersReport';
import type { FinancialReport, FollowUpItem, FollowUpReminderResult, FollowUpsReport, TransactionsReport } from '@opd/shared';
import { computeTransactions } from '../utils/transactions';

export const reportsRouter = Router();

reportsRouter.use(requireAuth, requireRole('ADMIN', 'DOCTOR', 'PHARMACIST', 'LAB_TECHNICIAN', 'RADIOLOGY_TECHNICIAN'));

// Clinic-wide views; the department counters only get their own revenue
// and orders (below).
const CLINICAL = requireRole('ADMIN', 'DOCTOR');

// The department a counter role reports on, if it is one.
const DEPARTMENT_OF: Partial<Record<Role, Department>> = {
  PHARMACIST: 'PHARMACY',
  LAB_TECHNICIAN: 'LAB',
  RADIOLOGY_TECHNICIAN: 'RADIOLOGY',
};

// A doctor only ever sees their own patients.
async function forcedDoctorId(req: AuthedRequest, requested: string | undefined): Promise<string | undefined> {
  if (req.auth!.role !== 'DOCTOR') return requested;
  const me = await prisma.doctorProfile.findUnique({ where: { userId: req.auth!.userId } });
  if (!me) throw new HttpError(404, 'Doctor profile not found');
  return me.id;
}

function checkRange(from: string, to: string) {
  if (from > to) throw new HttpError(400, 'The start date is after the end date');
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  if (days > 366) throw new HttpError(400, 'Pick a range of a year or less');
}

function parseDateOnly(dateStr: string): Date {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, 'Invalid date, expected YYYY-MM-DD');
  }
  return date;
}

const rangeQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

reportsRouter.get(
  '/financial',
  CLINICAL,
  requireTier(2),
  asyncHandler(async (req: AuthedRequest, res) => {
    const query = rangeQuerySchema.parse(req.query);
    const to = query.to ? parseDateOnly(query.to) : new Date();
    to.setUTCHours(0, 0, 0, 0);
    const from = query.from ? parseDateOnly(query.from) : new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000);

    const [pharmacy, lab, radiology] = await Promise.all([
      computePharmacyReport(req.auth!.clinicId, from, to),
      computeLabReport(req.auth!.clinicId, from, to),
      computeRadiologyReport(req.auth!.clinicId, from, to),
    ]);

    const response: FinancialReport = {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      pharmacy,
      lab,
      radiology,
    };
    res.json(response);
  }),
);

const transactionsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  doctorId: z.string().optional(),
  types: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',') : ['CONSULTATION', 'PHARMACY', 'LAB', 'RADIOLOGY', 'IPD']))
    .pipe(z.array(z.enum(['CONSULTATION', 'PHARMACY', 'LAB', 'RADIOLOGY', 'IPD']))),
});

// Every bill in a date range with billed vs collected -- the main Reports
// view. A doctor sees only their own patients' bills.
reportsRouter.get(
  '/transactions',
  asyncHandler(async (req: AuthedRequest, res) => {
    const q = transactionsQuerySchema.parse(req.query);
    checkRange(q.from, q.to);
    const doctorId = await forcedDoctorId(req, q.doctorId);
    // A department counter sees only its own bills.
    const own = DEPARTMENT_OF[req.auth!.role];
    const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: req.auth!.clinicId }, select: { tier: true } });
    const report: TransactionsReport = await computeTransactions({
      clinicId: req.auth!.clinicId,
      tier: clinic.tier,
      from: q.from,
      to: q.to,
      doctorId,
      types: own ? [own] : q.types,
    });
    res.json(report);
  }),
);

const ordersQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  doctorId: z.string().optional(),
  departments: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',') : ['CONSULTATION', 'PHARMACY', 'LAB', 'RADIOLOGY', 'PROCEDURE', 'ROOM', 'OTHER_IPD']))
    .pipe(z.array(z.enum(['CONSULTATION', 'PHARMACY', 'LAB', 'RADIOLOGY', 'PROCEDURE', 'ROOM', 'OTHER_IPD']))),
});

// In-house revenue by department: consultation fees, and what doctors
// prescribed/ordered vs what the pharmacy, lab and radiology earned from
// it. A doctor sees their own patients; a department counter, its own
// department.
reportsRouter.get(
  '/orders',
  asyncHandler(async (req: AuthedRequest, res) => {
    const q = ordersQuerySchema.parse(req.query);
    checkRange(q.from, q.to);
    const own = DEPARTMENT_OF[req.auth!.role];
    const clinic = await prisma.clinic.findUniqueOrThrow({ where: { id: req.auth!.clinicId }, select: { tier: true } });
    const report: OrdersReport = await computeOrdersReport({
      clinicId: req.auth!.clinicId,
      tier: clinic.tier,
      from: q.from,
      to: q.to,
      doctorId: await forcedDoctorId(req, q.doctorId),
      departments: own ? [own] : q.departments,
    });
    res.json(report);
  }),
);

const rangeSchema = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

// A department's own report: every medicine or test it sold in the dates,
// with revenue, cost and profit. A counter sees its own department.
reportsRouter.get(
  '/department',
  requireTier(2),
  asyncHandler(async (req: AuthedRequest, res) => {
    const q = rangeSchema.extend({ department: z.enum(['PHARMACY', 'LAB', 'RADIOLOGY']) }).parse(req.query);
    checkRange(q.from, q.to);
    const own = DEPARTMENT_OF[req.auth!.role];
    if (req.auth!.role === 'DOCTOR') throw new HttpError(403, 'Department reports are for the department and admin');
    if (own && own !== q.department) throw new HttpError(403, 'You can only see your own department');
    const report: DepartmentReport = await computeDepartmentReport(req.auth!.clinicId, q.department, q.from, q.to);
    res.json(report);
  }),
);

// The doctors' share of in-house profit. Admin sees every doctor; a doctor
// sees their own.
reportsRouter.get(
  '/doctor-share',
  CLINICAL,
  requireTier(2),
  asyncHandler(async (req: AuthedRequest, res) => {
    const q = rangeSchema.parse(req.query);
    checkRange(q.from, q.to);
    const report: DoctorShareReport = await computeDoctorShare(req.auth!.clinicId, q.from, q.to, await forcedDoctorId(req, undefined));
    res.json(report);
  }),
);

reportsRouter.get(
  '/profit-share-rates',
  CLINICAL,
  requireTier(2),
  asyncHandler(async (req: AuthedRequest, res) => {
    const doctorId = await forcedDoctorId(req, undefined);
    const rates = await prisma.profitShareRate.findMany({
      where: { clinicId: req.auth!.clinicId, ...(doctorId ? { OR: [{ doctorId }, { doctorId: null }] } : {}) },
    });
    const response: ProfitShareRate[] = rates.map((r) => ({ doctorId: r.doctorId, department: r.department, percent: r.percent }));
    res.json(response);
  }),
);

const ratesSchema = z.object({
  rates: z
    .array(
      z.object({
        doctorId: z.string().min(1).nullable(),
        department: z.enum(['PHARMACY', 'LAB', 'RADIOLOGY']),
        // null clears a doctor's own rate (back to the clinic default).
        percent: z.number().min(0).max(100).nullable(),
      }),
    )
    .max(500),
});

// Admin sets the rates: the clinic default per department, and any
// doctor's own.
reportsRouter.put(
  '/profit-share-rates',
  requireRole('ADMIN'),
  requireTier(2),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { rates } = ratesSchema.parse(req.body);
    const clinicId = req.auth!.clinicId;
    const doctorIds = [...new Set(rates.flatMap((r) => (r.doctorId ? [r.doctorId] : [])))];
    const found = await prisma.doctorProfile.count({ where: { id: { in: doctorIds }, user: { clinicId } } });
    if (found !== doctorIds.length) throw new HttpError(404, 'Doctor not found');
    await prisma.$transaction(async (tx) => {
      for (const r of rates) {
        await tx.profitShareRate.deleteMany({ where: { clinicId, doctorId: r.doctorId, department: r.department } });
        if (r.percent != null) await tx.profitShareRate.create({ data: { clinicId, doctorId: r.doctorId, department: r.department, percent: r.percent } });
      }
    });
    const all = await prisma.profitShareRate.findMany({ where: { clinicId } });
    res.json(all.map((r) => ({ doctorId: r.doctorId, department: r.department, percent: r.percent })));
  }),
);

reportsRouter.get(
  '/daily-activity',
  CLINICAL,
  asyncHandler(async (req: AuthedRequest, res) => {
    const dateStr = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0, 10);
    const date = parseDateOnly(dateStr);
    const report = await computeDailyActivity(req.auth!.clinicId, date);
    res.json(report);
  }),
);

reportsRouter.get(
  '/follow-ups',
  CLINICAL,
  asyncHandler(async (req: AuthedRequest, res) => {
    const clinicId = req.auth!.clinicId;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const weekAhead = endOfDay(new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000));

    const consultations = await prisma.consultation.findMany({
      where: {
        followUpContacted: false,
        followUpDate: { not: null, lte: weekAhead },
        appointment: { clinicId },
      },
      include: {
        appointment: {
          include: { patient: true, doctor: { include: { user: true } } },
        },
      },
      orderBy: { followUpDate: 'asc' },
    });

    const report: FollowUpsReport = { overdue: [], dueToday: [], dueThisWeek: [] };
    const todayEnd = endOfDay(today);

    for (const c of consultations) {
      if (!c.followUpDate || !c.appointment.patient) continue;
      const item: FollowUpItem = {
        consultationId: c.id,
        appointmentId: c.appointmentId,
        patientId: c.appointment.patient.id,
        patientName: c.appointment.patient.name,
        patientPhone: c.appointment.patient.phone,
        doctorName: c.appointment.doctor.user.name,
        followUpDate: c.followUpDate.toISOString().slice(0, 10),
        contacted: c.followUpContacted,
      };
      if (c.followUpDate < today) {
        report.overdue.push(item);
      } else if (c.followUpDate <= todayEnd) {
        report.dueToday.push(item);
      } else {
        report.dueThisWeek.push(item);
      }
    }

    res.json(report);
  }),
);

reportsRouter.post(
  '/follow-ups/:consultationId/contacted',
  CLINICAL,
  asyncHandler(async (req: AuthedRequest, res) => {
    const consultation = await prisma.consultation.findFirst({
      where: { id: req.params.consultationId, appointment: { clinicId: req.auth!.clinicId } },
    });
    if (!consultation) throw new HttpError(404, 'Consultation not found');
    await prisma.consultation.update({
      where: { id: consultation.id },
      data: { followUpContacted: true },
    });
    res.json({ message: 'Marked as contacted' });
  }),
);

reportsRouter.post(
  '/follow-ups/:consultationId/remind',
  CLINICAL,
  asyncHandler(async (req: AuthedRequest, res) => {
    const consultation = await prisma.consultation.findFirst({
      where: { id: req.params.consultationId, appointment: { clinicId: req.auth!.clinicId } },
      include: { appointment: { include: { patient: true, doctor: { include: { user: true } } } } },
    });
    if (!consultation) throw new HttpError(404, 'Consultation not found');
    if (!consultation.followUpDate) throw new HttpError(400, 'This consultation has no follow-up date set');

    const { email, whatsapp } = await sendFollowUpReminder(consultation);
    const response: FollowUpReminderResult = { email: toNotification(email), whatsapp: toNotification(whatsapp) };
    res.status(201).json(response);
  }),
);
