import { Router } from 'express';
import { z } from 'zod';
import type { DashboardDay, DashboardSummary } from '@opd/shared';
import { prisma } from '../prisma';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth';
import { parseDateOnly } from '../utils/dates';

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

// The clinic's own calendar day. Every clinic so far is in India; the
// browser sends its local date, and timestamps (registrations, payments)
// are bucketed by India time so "today" matches the clinic's day.
const CLINIC_OFFSET = '+05:30';
const startOfClinicDay = (date: string) => new Date(`${date}T00:00:00${CLINIC_OFFSET}`);
const clinicDateOf = (d: Date) => new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

// The dashboard: headline counts plus the month so far, day by day.
// Revenue (money actually collected) is for admin only.
dashboardRouter.get(
  '/',
  requireRole('ADMIN', 'RECEPTIONIST', 'DOCTOR'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { date } = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.query);
    const clinicId = req.auth!.clinicId;
    const showRevenue = req.auth!.role === 'ADMIN';

    const month = date.slice(0, 7);
    const [y, m] = month.split('-').map(Number) as [number, number];
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const monthDates = Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
    const nextMonth = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

    const dayStart = startOfClinicDay(date);
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);

    const [totalPatients, registeredToday, appointmentsToday, perDay, payments] = await Promise.all([
      prisma.user.count({ where: { clinicId, role: 'PATIENT' } }),
      prisma.user.count({ where: { clinicId, role: 'PATIENT', createdAt: { gte: dayStart, lt: dayEnd } } }),
      prisma.appointment.count({ where: { clinicId, date: parseDateOnly(date), status: { not: 'CANCELLED' } } }),
      prisma.appointment.groupBy({
        by: ['date'],
        where: {
          clinicId,
          date: { gte: parseDateOnly(monthDates[0]!), lt: parseDateOnly(nextMonth) },
          status: { not: 'CANCELLED' },
        },
        _count: { _all: true },
      }),
      showRevenue
        ? prisma.payment.findMany({
            where: { clinicId, createdAt: { gte: startOfClinicDay(monthDates[0]!), lt: startOfClinicDay(nextMonth) } },
            select: { amount: true, createdAt: true },
          })
        : Promise.resolve([]),
    ]);

    const appointmentsByDate = new Map(perDay.map((d) => [d.date.toISOString().slice(0, 10), d._count._all]));
    const revenueByDate = new Map<string, number>();
    for (const p of payments) {
      const d = clinicDateOf(p.createdAt);
      revenueByDate.set(d, (revenueByDate.get(d) ?? 0) + p.amount);
    }
    const days: DashboardDay[] = monthDates.map((d) => ({
      date: d,
      appointments: appointmentsByDate.get(d) ?? 0,
      revenue: showRevenue ? Math.round((revenueByDate.get(d) ?? 0) * 100) / 100 : null,
    }));

    const summary: DashboardSummary = {
      date,
      totalPatients,
      registeredToday,
      appointmentsToday,
      revenueThisMonth: showRevenue ? Math.round(payments.reduce((n, p) => n + p.amount, 0) * 100) / 100 : null,
      month,
      days,
    };
    res.json(summary);
  }),
);
