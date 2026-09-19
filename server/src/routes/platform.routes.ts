import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../prisma';
import { signPlatformAdminToken } from '../utils/jwt';
import { toClinicWithSubscription, toSubscription, toSubscriptionPayment } from '../utils/serialize';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requirePlatformAdmin, type PlatformAuthedRequest } from '../middleware/platformAuth';
import { defaultSubscriptionAmount } from '../utils/subscriptionPricing';
import type { PlatformAdminAuthResponse, RenewSubscriptionRequest } from '@opd/shared';

export const platformRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

platformRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);
    const admin = await prisma.platformAdmin.findUnique({ where: { email: data.email } });
    if (!admin) throw new HttpError(401, 'Invalid email or password');
    const valid = await bcrypt.compare(data.password, admin.password);
    if (!valid) throw new HttpError(401, 'Invalid email or password');

    const token = signPlatformAdminToken(admin.id);
    const response: PlatformAdminAuthResponse = {
      token,
      admin: { id: admin.id, name: admin.name, email: admin.email },
    };
    res.json(response);
  }),
);

platformRouter.use(requirePlatformAdmin);

platformRouter.get(
  '/clinics',
  asyncHandler(async (_req, res) => {
    const clinics = await prisma.clinic.findMany({
      include: { subscription: true },
      orderBy: { createdAt: 'desc' },
    });
    // A clinic without a subscription row shouldn't exist post-registration
    // (clinics.routes.ts always creates one), but skip defensively rather
    // than 500 if one somehow slipped through (e.g. seeded directly).
    res.json(clinics.filter((c) => c.subscription).map((c) => toClinicWithSubscription(c as typeof c & { subscription: NonNullable<typeof c.subscription> })));
  }),
);

platformRouter.get(
  '/clinics/:clinicId/subscription/payments',
  asyncHandler(async (req, res) => {
    const subscription = await prisma.subscription.findUnique({ where: { clinicId: req.params.clinicId } });
    if (!subscription) throw new HttpError(404, 'This clinic has no subscription record');
    const payments = await prisma.subscriptionPayment.findMany({
      where: { subscriptionId: subscription.id },
      include: { recordedByAdmin: true },
      orderBy: { recordedAt: 'desc' },
    });
    res.json(payments.map(toSubscriptionPayment));
  }),
);

const renewSchema = z.object({
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']),
  amount: z.number().positive().optional(),
  notes: z.string().optional(),
});

platformRouter.post(
  '/clinics/:clinicId/subscription/renew',
  asyncHandler(async (req: PlatformAuthedRequest, res) => {
    const data = renewSchema.parse(req.body) as RenewSubscriptionRequest;
    const subscription = await prisma.subscription.findUnique({ where: { clinicId: req.params.clinicId } });
    if (!subscription) throw new HttpError(404, 'This clinic has no subscription record');

    const amount = data.amount ?? defaultSubscriptionAmount(data.tier, data.billingCycle);
    // A renewal always extends from whichever is later: "now" (a lapsed
    // subscription doesn't get backdated credit for the time it was down)
    // or the current period end (an early renewal stacks on top of time
    // already paid for, rather than shortening it).
    const periodStart = new Date(Math.max(Date.now(), subscription.currentPeriodEnd.getTime()));
    const periodDays = data.billingCycle === 'MONTHLY' ? 30 : 365;
    const periodEnd = new Date(periodStart.getTime() + periodDays * 24 * 60 * 60 * 1000);

    const [updatedSubscription] = await prisma.$transaction([
      prisma.subscription.update({
        where: { id: subscription.id },
        data: { tier: data.tier, billingCycle: data.billingCycle, amount, status: 'ACTIVE', currentPeriodEnd: periodEnd },
      }),
      prisma.subscriptionPayment.create({
        data: {
          subscriptionId: subscription.id,
          amount,
          billingCycle: data.billingCycle,
          periodStart,
          periodEnd,
          recordedByAdminId: req.platformAdmin!.adminId,
          notes: data.notes,
        },
      }),
      // The subscription is the source of truth for what a clinic is
      // actually paying for -- keep Clinic.tier (what requireTier reads)
      // in sync rather than letting the two drift apart.
      prisma.clinic.update({ where: { id: req.params.clinicId }, data: { tier: data.tier } }),
    ]);

    res.json(toSubscription(updatedSubscription));
  }),
);

platformRouter.post(
  '/clinics/:clinicId/subscription/suspend',
  asyncHandler(async (req, res) => {
    const subscription = await prisma.subscription.findUnique({ where: { clinicId: req.params.clinicId } });
    if (!subscription) throw new HttpError(404, 'This clinic has no subscription record');
    const updated = await prisma.subscription.update({ where: { id: subscription.id }, data: { status: 'SUSPENDED' } });
    res.json(toSubscription(updated));
  }),
);

platformRouter.post(
  '/clinics/:clinicId/subscription/reactivate',
  asyncHandler(async (req, res) => {
    const subscription = await prisma.subscription.findUnique({ where: { clinicId: req.params.clinicId } });
    if (!subscription) throw new HttpError(404, 'This clinic has no subscription record');
    if (subscription.currentPeriodEnd.getTime() < Date.now()) {
      throw new HttpError(400, 'This subscription has also lapsed past its renewal date -- use renew instead of reactivate');
    }
    const updated = await prisma.subscription.update({ where: { id: subscription.id }, data: { status: 'ACTIVE' } });
    res.json(toSubscription(updated));
  }),
);
