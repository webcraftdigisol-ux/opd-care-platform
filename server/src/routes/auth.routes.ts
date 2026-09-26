import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../prisma';
import { createPatient, splitName } from '../utils/patients';
import { signToken } from '../utils/jwt';
import { toClinicSummary, toPublicUser } from '../utils/serialize';
import { isWhatsAppDeliveryAvailable, sendWhatsAppOtp, toWhatsAppNumber } from '../utils/whatsapp';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { isSubscriptionActive, requireAuth, SUBSCRIPTION_INACTIVE_MESSAGE, type AuthedRequest } from '../middleware/auth';
import type { AuthResponse } from '@opd/shared';

export const authRouter = Router();

async function findClinicBySlug(slug: string) {
  const clinic = await prisma.clinic.findUnique({ where: { slug } });
  if (!clinic) throw new HttpError(404, 'Clinic not found — check the clinic code');
  return clinic;
}

// An account by email, or by phone number however it was typed at
// registration ("98765 43210", "+91 98765 43210", ...). Phones are compared
// in normalized E.164 form; the contains-filter just narrows the scan. A
// number can belong to several accounts (family members share a mobile, a
// doctor may also be registered as a patient) -- that counts as no match,
// and the person signs in with their email instead.
async function findUserByIdentifier(clinicId: string, identifier: string) {
  const value = identifier.trim();
  if (value.includes('@')) {
    return prisma.user.findUnique({ where: { clinicId_email: { clinicId, email: value } } });
  }
  const wanted = toWhatsAppNumber(value);
  if (!wanted) return null;
  const candidates = await prisma.user.findMany({
    where: { clinicId, phone: { contains: wanted.slice(-4) } },
  });
  const matches = candidates.filter((u) => toWhatsAppNumber(u.phone) === wanted);
  return matches.length === 1 ? matches[0] : null;
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
    // Self-signup gets a Patient ID and profile like a desk registration;
    // the one name field is split best-effort and can be corrected later.
    const { user } = await prisma.$transaction((tx) =>
      createPatient(
        tx,
        clinic.id,
        { ...splitName(data.name), email: data.email, phone: data.phone ?? '' },
        { password: data.password },
      ),
    );
    const token = signToken({ sub: user.id, role: user.role, clinicId: clinic.id });
    const response: AuthResponse = { token, user: toPublicUser(user), clinic: toClinicSummary(clinic) };
    res.status(201).json(response);
  }),
);

// `email` also accepts a phone number: walk-in patients are registered by
// phone with a placeholder email they never see, so after setting a
// password (see password reset below) the phone is how they sign in.
const loginSchema = z.object({
  clinicSlug: z.string().min(1),
  email: z.string().min(3),
  password: z.string().min(1),
});

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);
    const clinic = await findClinicBySlug(data.clinicSlug);

    const user = await findUserByIdentifier(clinic.id, data.email);
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

const whatsappOptInSchema = z.object({ whatsappOptIn: z.boolean() });

// The patient's own switch. (The only other way consent gets recorded is
// the front desk noting a walk-in patient's in-person agreement -- see
// POST /appointments/walk-in.)
authRouter.put(
  '/me/whatsapp-optin',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = whatsappOptInSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.auth!.userId },
      data: data.whatsappOptIn
        ? { whatsappOptIn: true, whatsappOptInAt: new Date(), whatsappOptInRecordedById: null }
        : { whatsappOptIn: false },
    });
    res.json(toPublicUser(user));
  }),
);

// ---- Forgot password: one-time code over WhatsApp ----

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_PER_HOUR = 5;

// Same reply whether or not an account matched, it has a WhatsApp number,
// or it's being rate-limited -- so this endpoint can't be used to find out
// who has an account at a clinic.
const OTP_REQUEST_REPLY = {
  message: 'If an account matches, a 6-digit code has been sent to its WhatsApp number. It expires in 10 minutes.',
};
const OTP_INVALID = 'That code is invalid or has expired. Request a new one and try again.';

const OTP_UNAVAILABLE = "Password reset over WhatsApp isn't available yet. Please ask your clinic to reset it for you.";

// Lets the sign-in page decide whether to offer "Forgot password?".
authRouter.get('/password-reset/status', (_req, res) => {
  res.json({ available: isWhatsAppDeliveryAvailable() });
});

const passwordResetRequestSchema = z.object({
  clinicSlug: z.string().min(1),
  identifier: z.string().min(3),
});

authRouter.post(
  '/password-reset/request',
  asyncHandler(async (req, res) => {
    if (!isWhatsAppDeliveryAvailable()) throw new HttpError(503, OTP_UNAVAILABLE);
    const data = passwordResetRequestSchema.parse(req.body);
    const clinic = await findClinicBySlug(data.clinicSlug);
    const user = await findUserByIdentifier(clinic.id, data.identifier);
    if (!user || !toWhatsAppNumber(user.phone)) {
      res.json(OTP_REQUEST_REPLY);
      return;
    }

    const recent = await prisma.passwordResetOtp.findMany({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
      orderBy: { createdAt: 'desc' },
    });
    const tooSoon = recent[0] && Date.now() - recent[0].createdAt.getTime() < OTP_RESEND_COOLDOWN_MS;
    if (tooSoon || recent.length >= OTP_MAX_PER_HOUR) {
      res.json(OTP_REQUEST_REPLY);
      return;
    }

    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    // Only the newest code is ever valid.
    await prisma.passwordResetOtp.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await prisma.passwordResetOtp.create({
      data: { userId: user.id, codeHash: await bcrypt.hash(code, 10), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });
    await sendWhatsAppOtp({ clinicId: clinic.id, userId: user.id, to: user.phone, code });
    res.json(OTP_REQUEST_REPLY);
  }),
);

const passwordResetConfirmSchema = z.object({
  clinicSlug: z.string().min(1),
  identifier: z.string().min(3),
  code: z.string().regex(/^\d{6}$/, 'The code is 6 digits'),
  newPassword: z.string().min(6),
});

authRouter.post(
  '/password-reset/confirm',
  asyncHandler(async (req, res) => {
    const data = passwordResetConfirmSchema.parse(req.body);
    const clinic = await findClinicBySlug(data.clinicSlug);
    const user = await findUserByIdentifier(clinic.id, data.identifier);
    if (!user) throw new HttpError(400, OTP_INVALID);

    const otp = await prisma.passwordResetOtp.findFirst({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) throw new HttpError(400, OTP_INVALID);

    if (!(await bcrypt.compare(data.code, otp.codeHash))) {
      // Conditional increment, so parallel guesses can't exceed the limit;
      // the last allowed wrong guess also retires the code.
      await prisma.passwordResetOtp.updateMany({
        where: { id: otp.id, attempts: { lt: OTP_MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      });
      await prisma.passwordResetOtp.updateMany({
        where: { id: otp.id, attempts: { gte: OTP_MAX_ATTEMPTS } },
        data: { usedAt: new Date() },
      });
      throw new HttpError(400, OTP_INVALID);
    }

    // Claim the code before changing the password, so it can only be used once.
    const claimed = await prisma.passwordResetOtp.updateMany({
      where: { id: otp.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) throw new HttpError(400, OTP_INVALID);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(data.newPassword, 10) },
    });
    res.json({ message: 'Password updated. You can now log in with your new password.' });
  }),
);
