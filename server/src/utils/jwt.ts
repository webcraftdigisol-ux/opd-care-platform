import jwt from 'jsonwebtoken';
import type { Role } from '@opd/shared';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export interface JwtPayload {
  sub: string;
  role: Role;
  clinicId: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload & { typ?: string };
  // A platform-admin token is structurally similar (also a jsonwebtoken
  // signed with the same secret) but must never be usable as a clinic
  // token -- typ distinguishes them so one token type can't be replayed as
  // the other. See PlatformAdminJwtPayload/signPlatformAdminToken below.
  if (decoded.typ === 'platform_admin') {
    throw new Error('Not a clinic token');
  }
  return decoded;
}

export interface PlatformAdminJwtPayload {
  sub: string;
  typ: 'platform_admin';
}

export function signPlatformAdminToken(adminId: string): string {
  const payload: PlatformAdminJwtPayload = { sub: adminId, typ: 'platform_admin' };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
}

export function verifyPlatformAdminToken(token: string): PlatformAdminJwtPayload {
  const decoded = jwt.verify(token, JWT_SECRET) as Partial<PlatformAdminJwtPayload>;
  if (decoded.typ !== 'platform_admin' || !decoded.sub) {
    throw new Error('Not a platform admin token');
  }
  return decoded as PlatformAdminJwtPayload;
}
