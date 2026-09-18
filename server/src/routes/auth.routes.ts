import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../prisma';
import { signToken } from '../utils/jwt';
import { toPublicUser } from '../utils/serialize';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, type AuthedRequest } from '../middleware/auth';
import type { AuthResponse } from '@opd/shared';

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(6).optional(),
  password: z.string().min(6),
});

authRouter.post(
  '/register',
  asyncHandler(async (req, res) => {
    const data = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new HttpError(409, 'An account with this email already exists');
    }
    const password = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        password,
        role: 'PATIENT',
      },
    });
    const token = signToken({ sub: user.id, role: user.role });
    const response: AuthResponse = { token, user: toPublicUser(user) };
    res.status(201).json(response);
  }),
);

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) {
      throw new HttpError(401, 'Invalid email or password');
    }
    const valid = await bcrypt.compare(data.password, user.password);
    if (!valid) {
      throw new HttpError(401, 'Invalid email or password');
    }
    const token = signToken({ sub: user.id, role: user.role });
    const response: AuthResponse = { token, user: toPublicUser(user) };
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
