import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../prisma';
import { signToken } from '../utils/jwt';
import { toClinicSummary, toPublicUser } from '../utils/serialize';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import { defaultSubscriptionAmount } from '../utils/subscriptionPricing';
import type { AuthResponse } from '@opd/shared';

const NEW_CLINIC_TRIAL_DAYS = 30;

export const clinicsRouter = Router();

const slugSchema = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9-]+$/, 'Clinic code may only contain lowercase letters, numbers, and hyphens');

const registerClinicSchema = z.object({
  clinicName: z.string().min(2),
  clinicSlug: slugSchema,
  adminName: z.string().min(2),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(6),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
});

clinicsRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const data = registerClinicSchema.parse(req.body);
    const existing = await prisma.clinic.findUnique({ where: { slug: data.clinicSlug } });
    if (existing) {
      throw new HttpError(409, 'That clinic code is already taken');
    }

    const password = await bcrypt.hash(data.adminPassword, 10);
    const tier = data.tier ?? 1;
    // A brand-new clinic gets a 30-day active subscription with no
    // SubscriptionPayment recorded yet -- access works immediately (this
    // registration flow is self-serve), but it lapses and blocks access
    // automatically after 30 days unless a platform admin records an actual
    // payment via /api/platform (see requireAuth's subscription check).
    const clinic = await prisma.clinic.create({
      data: {
        name: data.clinicName,
        slug: data.clinicSlug,
        tier,
        users: {
          create: {
            name: data.adminName,
            email: data.adminEmail,
            password,
            role: 'ADMIN',
          },
        },
        subscription: {
          create: {
            tier,
            billingCycle: 'MONTHLY',
            amount: defaultSubscriptionAmount(tier, 'MONTHLY'),
            currentPeriodEnd: new Date(Date.now() + NEW_CLINIC_TRIAL_DAYS * 24 * 60 * 60 * 1000),
          },
        },
      },
      include: { users: true },
    });

    const admin = clinic.users[0];
    const token = signToken({ sub: admin.id, role: admin.role, clinicId: clinic.id });
    const response: AuthResponse = {
      token,
      user: toPublicUser(admin),
      clinic: toClinicSummary(clinic),
    };
    res.status(201).json(response);
  }),
);

clinicsRouter.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const clinic = await prisma.clinic.findUnique({ where: { slug: req.params.slug } });
    if (!clinic) throw new HttpError(404, 'Clinic not found');
    res.json(toClinicSummary(clinic));
  }),
);

clinicsRouter.get(
  '/me/current',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const clinic = await prisma.clinic.findUnique({ where: { id: req.auth!.clinicId } });
    if (!clinic) throw new HttpError(404, 'Clinic not found');
    res.json(toClinicSummary(clinic));
  }),
);
