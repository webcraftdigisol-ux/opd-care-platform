import type { NextFunction, Request, Response } from 'express';
import { SUBSCRIPTION_INACTIVE_MESSAGE, type ClinicTier, type Role } from '@opd/shared';
import { verifyToken } from '../utils/jwt';
import { prisma } from '../prisma';
import { HttpError } from './errorHandler';

export { SUBSCRIPTION_INACTIVE_MESSAGE };

export interface AuthedRequest extends Request {
  auth?: {
    userId: string;
    role: Role;
    clinicId: string;
  };
}

// A subscription is active iff its status is ACTIVE and its current period
// hasn't passed -- a lapsed renewal blocks access automatically with no cron
// job needed to flip a status; see prisma/schema.prisma's Subscription model.
export function isSubscriptionActive(sub: { status: string; currentPeriodEnd: Date } | null): boolean {
  if (!sub) return false;
  if (sub.status !== 'ACTIVE') return false;
  return sub.currentPeriodEnd.getTime() >= Date.now();
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid Authorization header' });
  }
  const token = header.slice('Bearer '.length);
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
  // Fetched fresh per request, same as requireTier below -- so a clinic
  // suspended (or reactivated) by a platform admin takes effect on the very
  // next request, not just after the token expires or a re-login. Unlike
  // requireTier (opt-in per route), requireAuth gates every route in every
  // router, so a DB error here must reach next(err) rather than hang the
  // request as an unhandled rejection would.
  try {
    const [subscription, account] = await Promise.all([
      prisma.subscription.findUnique({ where: { clinicId: payload.clinicId } }),
      prisma.user.findUnique({ where: { id: payload.sub }, select: { active: true } }),
    ]);
    if (!isSubscriptionActive(subscription)) {
      return res.status(403).json({ message: SUBSCRIPTION_INACTIVE_MESSAGE });
    }
    // A deactivated (or deleted) account is signed out on its next request,
    // not only once its token expires.
    if (!account?.active) {
      return res.status(401).json({ message: 'This account has been deactivated' });
    }
  } catch (err) {
    return next(err);
  }
  req.auth = { userId: payload.sub, role: payload.role, clinicId: payload.clinicId };
  if (payload.role === 'PATIENT') hidePrivateFieldsFromPatient(res);
  next();
}

// Fields written for the clinic's eyes only (the doctor's private notes on a
// visit). Blanked in every response to a patient's own login, whichever
// route or nesting they arrive through, rather than trusting each endpoint
// to remember.
const PRIVATE_FIELDS = ['doctorNotes'];

export function scrubPrivateFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubPrivateFields);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, PRIVATE_FIELDS.includes(k) ? null : scrubPrivateFields(v)]),
    );
  }
  return value;
}

function hidePrivateFieldsFromPatient(res: Response) {
  const json = res.json.bind(res);
  res.json = (body?: unknown) => json(scrubPrivateFields(body));
}

export function requireRole(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    next();
  };
}

// Gates a route to clinics whose subscription tier is at least minTier.
// Fetched fresh per request (not baked into the JWT) so a clinic that
// upgrades or downgrades its tier takes effect without re-login.
export function requireTier(minTier: ClinicTier) {
  return async (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      return next(new HttpError(401, 'Not authenticated'));
    }
    const clinic = await prisma.clinic.findUnique({ where: { id: req.auth.clinicId } });
    if (!clinic) {
      return next(new HttpError(404, 'Clinic not found'));
    }
    if (clinic.tier < minTier) {
      return next(new HttpError(403, `This feature requires a Tier ${minTier}+ subscription`));
    }
    next();
  };
}
