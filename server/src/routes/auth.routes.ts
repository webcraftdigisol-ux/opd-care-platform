import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../prisma';
import { signToken } from '../utils/jwt';
import { toClinicSummary, toPublicUser } from '../utils/serialize';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { isSubscriptionActive, requireAuth, SUBSCRIPTION_INACTIVE_MESSAGE, type AuthedRequest } from '../middleware/auth';
import type { AuthResponse } from '@opd/shared';

export const authRouter = Router();

async function findClinicBySlug(slug: string) {
  const clinic = await prisma.clinic.findUnique({ where: { slug } });
  if (!clinic) throw new HttpError(404, 'Clinic not found — check the clinic code');
  return clinic;
}

const registerSchema = z.object({
  clinicSlug: z.string().min(1),
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(6).optional(),
  password: z.string().min(6),
});

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);
    const clinic = await findClinicBySlug(data.clinicSlug);

    const subscription = await prisma.subscription.findUnique({ where: { clinicId: clinic.id } });
    if (!isSubscriptionActive(subscription)) {
      throw new HttpError(403, SUBSCRIPTION_INACTIVE_MESSAGE);
    }

    const existing = await prisma.user.findUnique({
      where: { clinicId_email: { clinicId: clinic.id, email: data.email } },
    });
    if (existing) {
      throw new HttpError(409, 'An account with this email already exists at this clinic');
    }
    const password = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: {
        clinicId: clinic.id,
        name: data.name,
        email: data.email,
        phone: data.phone,
        password,
        role: 'PATIENT',
      },
    });
    const token = signToken({ sub: user.id, role: user.role, clinicId: clinic.id });
    const response: AuthResponse = { token, user: toPublicUser(user), clinic: toClinicSummary(clinic) };
    res.status(201).json(response);
  }),
);

const loginSchema = z.object({
  clinicSlug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);
    const clinic = await findClinicBySlug(data.clinicSlug);

    const user = await prisma.user.findUnique({
      where: { clinicId_email: { clinicId: clinic.id, email: data.email } },
    });
    if (!user) {
      throw new HttpError(401, 'Invalid email or password');
    }
    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) {
      throw new HttpError(401, 'Invalid email or password');
    }
    // Checked only after credentials are confirmed valid, so an
    // unauthenticated login attempt never leaks a clinic's billing state.
    const subscription = await prisma.subscription.findUnique({ where: { clinicId: clinic.id } });
    if (!isSubscriptionActive(subscription)) {
      throw new HttpError(403, SUBSCRIPTION_INACTIVE_MESSAGE);
    }
    const token = signToken({ sub: user.id, role: user.role, clinicId: clinic.id });
    const response: AuthResponse = { token, user: toPublicUser(user), clinic: toClinicSummary(clinic) };
    res.json(response);
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!user) throw new HttpError(404, 'User not found');
    res.json(toPublicUser(user));
  }),
);
