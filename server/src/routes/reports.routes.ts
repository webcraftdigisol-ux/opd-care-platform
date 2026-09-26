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
import type { Department, OrdersReport, Role } from '@opd/shared';
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
    .transform((v) => (v ? v.split(',') : ['CONSULTATION', 'PHARMACY', 'LAB', 'RADIOLOGY']))
    .pipe(z.array(z.enum(['CONSULTATION', 'PHARMACY', 'LAB', 'RADIOLOGY']))),
});

// In-house revenue by department: consultation fees, and what doctors
// prescribed/ordered vs what the pharmacy, lab and radiology earned from
// it. A doctor sees their own patients; a department counter, its own
// department.
reportsRouter.get(
  '/orders',
  requireTier(2),
  asyncHandler(async (req: AuthedRequest, res) => {
    const q = ordersQuerySchema.parse(req.query);
    checkRange(q.from, q.to);
    const own = DEPARTMENT_OF[req.auth!.role];
    const report: OrdersReport = await computeOrdersReport({
      clinicId: req.auth!.clinicId,
      from: q.from,
      to: q.to,
      doctorId: await forcedDoctorId(req, q.doctorId),
      departments: own ? [own] : q.departments,
    });
    res.json(report);
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
