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
import type { FinancialReport, FollowUpItem, FollowUpReminderResult, FollowUpsReport } from '@opd/shared';

export const reportsRouter = Router();

reportsRouter.use(requireAuth, requireRole('ADMIN', 'DOCTOR'));

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

reportsRouter.get(
  '/daily-activity',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dateStr = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0, 10);
    const date = parseDateOnly(dateStr);
    const report = await computeDailyActivity(req.auth!.clinicId, date);
    res.json(report);
  }),
);

reportsRouter.get(
  '/follow-ups',
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
