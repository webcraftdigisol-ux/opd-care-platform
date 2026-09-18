import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@opd/shared';
import { verifyToken } from '../utils/jwt';

export interface AuthedRequest extends Request {
  auth?: {
    userId: string;
    role: Role;
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
    req.auth = { userId: payload.sub, role: payload.role };
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
