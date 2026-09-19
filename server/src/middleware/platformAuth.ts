import type { NextFunction, Request, Response } from 'express';
import { verifyPlatformAdminToken } from '../utils/jwt';

export interface PlatformAuthedRequest extends Request {
  platformAdmin?: {
    adminId: string;
  };
}

// Deliberately separate from requireAuth (middleware/auth.ts): a clinic JWT
// and a platform-admin JWT are different token types (see utils/jwt.ts's
// typ discriminator), so neither can be replayed against the other's
// routes. Platform routes never read req.auth, and clinic routes never
// read req.platformAdmin.
export function requirePlatformAdmin(req: PlatformAuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid Authorization header' });
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyPlatformAdminToken(token);
    req.platformAdmin = { adminId: payload.sub };
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}
