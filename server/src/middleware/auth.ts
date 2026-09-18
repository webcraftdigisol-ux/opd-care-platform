import type { NextFunction, Request, Response } from 'express';
import type { ClinicTier, Role } from '@opd/shared';
import { verifyToken } from '../utils/jwt';
import { prisma } from '../prisma';
import { HttpError } from './errorHandler';

export interface AuthedRequest extends Request {
  auth?: {
    userId: string;
    role: Role;
    clinicId: string;
  };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid Authorization header' });
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyToken(token);
    req.auth = { userId: payload.sub, role: payload.role, clinicId: payload.clinicId };
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
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
