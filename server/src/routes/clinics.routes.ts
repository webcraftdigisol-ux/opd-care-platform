import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../prisma';
import { signToken } from '../utils/jwt';
import { toClinicSummary, toPublicUser } from '../utils/serialize';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth';
import { defaultSubscriptionAmount } from '../utils/subscriptionPricing';
import { loadStandardCatalogue, loadStandardMedicines, loadStandardTests } from '../utils/standardLists';
import { toSubscription } from '../utils/serialize';
import type { AuthResponse } from '@opd/shared';

const NEW_CLINIC_TRIAL_DAYS = 30;

export const clinicsRouter = Router();

// The clinic code is also the clinic's web address (anandi.ohmscare.in),
// so it must be a valid DNS label and not one of the platform's own names.
export const RESERVED_CLINIC_CODES = new Set([
  'app', 'api', 'www', 'admin', 'platform', 'mail', 'email', 'smtp', 'ftp', 'static', 'assets', 'cdn',
  'status', 'help', 'support', 'docs', 'blog', 'dev', 'staging', 'test', 'demo', 'login', 'ohmscare',
]);

const slugSchema = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, 'Clinic code may only contain lowercase letters, numbers, and hyphens (not at the start or end)')
  .refine((s) => !RESERVED_CLINIC_CODES.has(s), 'That clinic code is reserved; please choose another');

const registerClinicSchema = z.object({
  clinicName: z.string().min(2),
  clinicSlug: slugSchema,
  adminName: z.string().min(2),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(6),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  medicineSystem: z.enum(['ALLOPATHIC', 'AYURVEDIC', 'HOMEOPATHIC', 'MIXED']).optional(),
  loadStandardLists: z.boolean().optional(),
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
        medicineSystem: data.medicineSystem ?? 'ALLOPATHIC',
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

    // The standard lists for its system of medicine, ready to prescribe
    // from: the Doctor's Catalogue in Tier 1, the pharmacy's, lab's and
    // radiology's own lists from Tier 2 (unpriced until the departments
    // set prices).
    if (data.loadStandardLists) {
      if (tier >= 2) {
        await loadStandardMedicines(clinic.id);
        await loadStandardTests(clinic.id, 'LAB_TEST');
        await loadStandardTests(clinic.id, 'RADIOLOGY');
      } else {
        await loadStandardCatalogue(clinic.id);
      }
    }

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

const updateClinicSchema = z.object({
  name: z.string().trim().min(2).optional(),
  address: z.string().max(500).nullish().transform((v) => (v === undefined ? undefined : v?.trim() || null)),
  phone: z.string().max(40).nullish().transform((v) => (v === undefined ? undefined : v?.trim() || null)),
  // Changes which standard list "Load standard list" adds from now on.
  medicineSystem: z.enum(['ALLOPATHIC', 'AYURVEDIC', 'HOMEOPATHIC', 'MIXED']).optional(),
});

// The clinic's own details (letterhead on printed visit summaries).
clinicsRouter.put(
  '/me/current',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = updateClinicSchema.parse(req.body);
    const clinic = await prisma.clinic.update({ where: { id: req.auth!.clinicId }, data });
    res.json(toClinicSummary(clinic));
  }),
);

// Self-service read of the clinic's own billing status -- distinct from
// the platform-admin-only /api/platform/clinics/:id/subscription view,
// which can see every clinic's; this is what powers a clinic ADMIN's own
// "Renew Now" page.
clinicsRouter.get(
  '/me/subscription',
  requireAuth,
  requireRole('ADMIN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const subscription = await prisma.subscription.findUnique({ where: { clinicId: req.auth!.clinicId } });
    if (!subscription) throw new HttpError(404, 'This clinic has no subscription record');
    res.json(toSubscription(subscription));
  }),
);
