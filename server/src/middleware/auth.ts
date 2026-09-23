import type { NextFunction, Request, Response } from 'express';
import { PATIENT_PORTAL_DISABLED_MESSAGE, SUBSCRIPTION_INACTIVE_MESSAGE, type ClinicTier, type Role } from '@opd/shared';
import { verifyToken } from '../utils/jwt';
import { prisma } from '../prisma';
import { HttpError } from './errorHandler';
import { isPatientPortalEnabled } from '../utils/features';

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
  // Login already refuses patients while the portal is off; this also shuts
  // out a patient token issued before it was switched off.
  if (payload.role === 'PATIENT' && !isPatientPortalEnabled()) {
    return res.status(403).json({ message: PATIENT_PORTAL_DISABLED_MESSAGE });
  }
  // Fetched fresh per request, same as requireTier below -- so a clinic
  // suspended (or reactivated) by a platform admin takes effect on the very
  // next request, not just after the token expires or a re-login. Unlike
  // requireTier (opt-in per route), requireAuth gates every route in every
  // router, so a DB error here must reach next(err) rather than hang the
  // request as an unhandled rejection would.
  try {
    const subscription = await prisma.subscription.findUnique({ where: { clinicId: payload.clinicId } });
    if (!isSubscriptionActive(subscription)) {
      return res.status(403).json({ message: SUBSCRIPTION_INACTIVE_MESSAGE });
    }
  } catch (err) {
    return next(err);
  }
  req.auth = { userId: payload.sub, role: payload.role, clinicId: payload.clinicId };
  next();
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
