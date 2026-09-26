import request from 'supertest';
import { ensurePatientProfile } from '../src/utils/patients';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { app } from '../src/app';
import { prisma } from '../src/prisma';
import type { Role, ClinicTier } from '@opd/shared';

export { app, prisma };

function randomSuffix(): string {
  return crypto.randomBytes(4).toString('hex');
}

export function uniqueSlug(prefix = 'test-clinic'): string {
  return `${prefix}-${randomSuffix()}`;
}

export function uniqueEmail(prefix = 'user'): string {
  return `${prefix}-${randomSuffix()}@test.local`;
}

// Booking a fixed time slot for "today" is flaky in tests -- whatever time
// of day the suite happens to run, an early slot like "09:00" may already be
// in the past and get filtered out as unavailable. Tomorrow sidesteps that
// entirely (no past-slot filtering applies to a future date), and every
// createDoctor() schedule below covers all 7 days 09:00-18:00, so "09:00" is
// always valid on it.
export function tomorrowDateStr(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function createClinic(
  opts: { tier?: ClinicTier; taxPercent?: number; slug?: string; name?: string } = {},
) {
  const tier = opts.tier ?? 1;
  const clinic = await prisma.clinic.create({
    data: {
      name: opts.name ?? 'Test Clinic',
      slug: opts.slug ?? uniqueSlug(),
      tier,
      taxPercent: opts.taxPercent ?? 0,
    },
  });
  // Created directly via Prisma rather than POST /clinics/register, so it
  // needs its own subscription too -- requireAuth (middleware/auth.ts) 403s
  // every route, login included, for a clinic with none. Far-future so
  // ordinary tests never brush against the lapse boundary; subscription.test.ts
  // covers the lapse/suspend/reactivate behavior itself directly.
  await prisma.subscription.create({
    data: {
      clinicId: clinic.id,
      tier,
      billingCycle: 'MONTHLY',
      status: 'ACTIVE',
      amount: 0,
      currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });
  return clinic;
}

export async function createUser(
  clinicId: string,
  role: Role,
  opts: { email?: string; password?: string; name?: string; phone?: string } = {},
) {
  const password = opts.password ?? 'password123';
  const hash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      clinicId,
      name: opts.name ?? `${role} Test`,
      email: opts.email ?? uniqueEmail(role.toLowerCase()),
      phone: opts.phone,
      password: hash,
      role,
    },
  });
  if (role === 'PATIENT') await ensurePatientProfile(prisma, user);
  return { user, password };
}

export async function createDoctor(
  clinicId: string,
  opts: { email?: string; password?: string; consultationFee?: number } = {},
) {
  const { user, password } = await createUser(clinicId, 'DOCTOR', opts);
  const doctorProfile = await prisma.doctorProfile.create({
    data: {
      userId: user.id,
      specialization: 'General Medicine',
      department: 'OPD',
      slotMinutes: 15,
      consultationFee: opts.consultationFee ?? 0,
    },
  });
  await prisma.schedule.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      doctorId: doctorProfile.id,
      dayOfWeek,
      startTime: '09:00',
      endTime: '18:00',
    })),
  });
  return { user, password, doctorProfile };
}

export async function loginAs(clinicSlug: string, email: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ clinicSlug, email, password });
  if (res.status !== 200) {
    throw new Error(`Login failed for ${email} @ ${clinicSlug}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body as { token: string; user: any; clinic: any };
}

export async function setupClinicWithAdmin(opts: { tier?: ClinicTier; taxPercent?: number } = {}) {
  const clinic = await createClinic(opts);
  const email = uniqueEmail('admin');
  const { password } = await createUser(clinic.id, 'ADMIN', { email });
  const session = await loginAs(clinic.slug, email, password);
  return { clinic, adminToken: session.token as string };
}

export async function createPlatformAdmin(opts: { email?: string; password?: string; name?: string } = {}) {
  const password = opts.password ?? 'password123';
  const hash = await bcrypt.hash(password, 10);
  const admin = await prisma.platformAdmin.create({
    data: {
      name: opts.name ?? 'Platform Admin Test',
      email: opts.email ?? uniqueEmail('platform-admin'),
      password: hash,
    },
  });
  return { admin, password };
}

export async function platformLoginAs(email: string, password: string) {
  const res = await request(app).post('/api/platform/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`Platform login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body as { token: string; admin: any };
}

export function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}
