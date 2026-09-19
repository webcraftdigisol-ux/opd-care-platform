import request from 'supertest';
import bcrypt from 'bcryptjs';
import {
  app,
  prisma,
  setupClinicWithAdmin,
  createPlatformAdmin,
  platformLoginAs,
  loginAs,
  uniqueEmail,
  uniqueSlug,
  auth,
} from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Subscription billing', () => {
  it('registering a clinic via the real endpoint auto-creates an active subscription, and access works immediately', async () => {
    const slug = uniqueSlug();
    const res = await request(app).post('/api/clinics/register').send({
      clinicName: 'Auto Sub Clinic',
      clinicSlug: slug,
      adminName: 'Admin',
      adminEmail: uniqueEmail('admin'),
      adminPassword: 'password123',
      tier: 2,
    });
    expect(res.status).toBe(201);

    const me = await request(app).get('/api/auth/me').set(auth(res.body.token));
    expect(me.status).toBe(200);

    const subscription = await prisma.subscription.findUnique({ where: { clinicId: res.body.user.clinicId } });
    expect(subscription).not.toBeNull();
    expect(subscription!.status).toBe('ACTIVE');
    expect(subscription!.tier).toBe(2);
    expect(subscription!.billingCycle).toBe('MONTHLY');
    expect(subscription!.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now());
  });

  it("a clinic with no subscription row at all is blocked from login (defense in depth, shouldn't happen via the real registration route)", async () => {
    const clinic = await prisma.clinic.create({
      data: { name: 'No Sub Clinic', slug: uniqueSlug(), tier: 1 },
    });
    const password = 'password123';
    await prisma.user.create({
      data: {
        clinicId: clinic.id,
        name: 'Admin',
        email: 'admin@nosub.test',
        password: await bcrypt.hash(password, 10),
        role: 'ADMIN',
      },
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ clinicSlug: clinic.slug, email: 'admin@nosub.test', password });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not active/i);
  });

  it('a lapsed subscription (currentPeriodEnd in the past, status still ACTIVE) blocks login and every already-issued token, automatically -- no status flip needed', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 2 });
    const admin = await prisma.user.findFirstOrThrow({ where: { clinicId: clinic.id, role: 'ADMIN' } });

    // Token issued while the subscription was still valid.
    const preLapseCheck = await request(app).get('/api/auth/me').set(auth(adminToken));
    expect(preLapseCheck.status).toBe(200);

    await prisma.subscription.update({
      where: { clinicId: clinic.id },
      data: { currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    const postLapseCheck = await request(app).get('/api/auth/me').set(auth(adminToken));
    expect(postLapseCheck.status).toBe(403);
    expect(postLapseCheck.body.message).toMatch(/not active/i);

    const loginAttempt = await request(app)
      .post('/api/auth/login')
      .send({ clinicSlug: clinic.slug, email: admin.email, password: 'password123' });
    expect(loginAttempt.status).toBe(403);
  });

  it('a lapsed subscription also blocks new patient self-registration at that clinic', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    await prisma.subscription.update({
      where: { clinicId: clinic.id },
      data: { currentPeriodEnd: new Date(Date.now() - 1000) },
    });

    const res = await request(app).post('/api/auth/register').send({
      clinicSlug: clinic.slug,
      name: 'New Patient',
      email: uniqueEmail('patient'),
      password: 'password123',
    });
    expect(res.status).toBe(403);
  });

  it('a SUSPENDED subscription blocks access regardless of currentPeriodEnd being in the future', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    await prisma.subscription.update({ where: { clinicId: clinic.id }, data: { status: 'SUSPENDED' } });

    const res = await request(app).get('/api/auth/me').set(auth(adminToken));
    expect(res.status).toBe(403);
  });

  it('a CANCELLED subscription blocks access the same way', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    await prisma.subscription.update({ where: { clinicId: clinic.id }, data: { status: 'CANCELLED' } });

    const res = await request(app).get('/api/auth/me').set(auth(adminToken));
    expect(res.status).toBe(403);
  });
});

describe('Platform admin: authentication', () => {
  it('logs in with correct credentials and issues a distinct token type', async () => {
    const { admin, password } = await createPlatformAdmin();
    const res = await request(app).post('/api/platform/login').send({ email: admin.email, password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.admin).toMatchObject({ id: admin.id, email: admin.email, name: admin.name });
  });

  it('rejects an unknown email or a wrong password', async () => {
    const { admin } = await createPlatformAdmin();
    const wrongPassword = await request(app).post('/api/platform/login').send({ email: admin.email, password: 'nope' });
    expect(wrongPassword.status).toBe(401);
    const unknownEmail = await request(app).post('/api/platform/login').send({ email: 'nobody@test.local', password: 'x' });
    expect(unknownEmail.status).toBe(401);
  });

  it("a clinic-scoped JWT can't be used on a platform route, and a platform JWT can't be used on a clinic route", async () => {
    const { adminToken } = await setupClinicWithAdmin();
    const { admin, password } = await createPlatformAdmin();
    const { token: platformToken } = await platformLoginAs(admin.email, password);

    const clinicTokenOnPlatformRoute = await request(app).get('/api/platform/clinics').set(auth(adminToken));
    expect(clinicTokenOnPlatformRoute.status).toBe(401);

    const platformTokenOnClinicRoute = await request(app).get('/api/auth/me').set(auth(platformToken));
    expect(platformTokenOnClinicRoute.status).toBe(401);
  });

  it('every /platform/* route requires a platform token, not just some of them', async () => {
    const noAuth = await request(app).get('/api/platform/clinics');
    expect(noAuth.status).toBe(401);
  });
});

describe('Platform admin: subscription management', () => {
  async function setupPlatformSession() {
    const { admin, password } = await createPlatformAdmin();
    const { token } = await platformLoginAs(admin.email, password);
    return { admin, token };
  }

  it('lists clinics with their subscription, including a correctly computed isActive flag', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 2 });
    const { token } = await setupPlatformSession();

    const res = await request(app).get('/api/platform/clinics').set(auth(token));
    expect(res.status).toBe(200);
    const entry = res.body.find((c: any) => c.id === clinic.id);
    expect(entry).toBeDefined();
    expect(entry.subscription.status).toBe('ACTIVE');
    expect(entry.subscription.isActive).toBe(true);
    expect(entry.subscription.tier).toBe(2);
  });

  it('renew extends the period from the later of now/currentPeriodEnd, records a payment, reactivates a suspended subscription, and syncs Clinic.tier', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    await prisma.subscription.update({ where: { clinicId: clinic.id }, data: { status: 'SUSPENDED' } });
    const { admin, token } = await setupPlatformSession();

    const res = await request(app)
      .post(`/api/platform/clinics/${clinic.id}/subscription/renew`)
      .set(auth(token))
      .send({ tier: 3, billingCycle: 'ANNUAL', amount: 45000, notes: 'Upgrade + renewal' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.tier).toBe(3);
    expect(res.body.billingCycle).toBe('ANNUAL');
    expect(res.body.amount).toBe(45000);
    expect(res.body.isActive).toBe(true);

    const updatedClinic = await prisma.clinic.findUniqueOrThrow({ where: { id: clinic.id } });
    expect(updatedClinic.tier).toBe(3);

    const payments = await request(app)
      .get(`/api/platform/clinics/${clinic.id}/subscription/payments`)
      .set(auth(token));
    expect(payments.status).toBe(200);
    expect(payments.body).toHaveLength(1);
    expect(payments.body[0]).toMatchObject({ amount: 45000, billingCycle: 'ANNUAL', notes: 'Upgrade + renewal', recordedByAdminName: admin.name });
  });

  it('renew defaults to the tier/cycle suggested price when amount is omitted', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { token } = await setupPlatformSession();

    const res = await request(app)
      .post(`/api/platform/clinics/${clinic.id}/subscription/renew`)
      .set(auth(token))
      .send({ tier: 2, billingCycle: 'MONTHLY' });
    expect(res.status).toBe(200);
    expect(res.body.amount).toBeGreaterThan(0);
  });

  it("an early renewal extends from the existing currentPeriodEnd rather than shortening it (doesn't discard time already paid for)", async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const farFuture = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000);
    await prisma.subscription.update({ where: { clinicId: clinic.id }, data: { currentPeriodEnd: farFuture } });
    const { token } = await setupPlatformSession();

    const res = await request(app)
      .post(`/api/platform/clinics/${clinic.id}/subscription/renew`)
      .set(auth(token))
      .send({ tier: 1, billingCycle: 'MONTHLY' });
    expect(res.status).toBe(200);
    // Extended from ~farFuture + 30 days, not from now + 30 days.
    expect(new Date(res.body.currentPeriodEnd).getTime()).toBeGreaterThan(farFuture.getTime());
  });

  it('a lapsed renewal does not get backdated credit for the time it was down (extends from now, not from the old lapsed date)', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const lapsedDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await prisma.subscription.update({ where: { clinicId: clinic.id }, data: { currentPeriodEnd: lapsedDate } });
    const { token } = await setupPlatformSession();

    const res = await request(app)
      .post(`/api/platform/clinics/${clinic.id}/subscription/renew`)
      .set(auth(token))
      .send({ tier: 1, billingCycle: 'MONTHLY' });
    expect(res.status).toBe(200);
    const newPeriodEnd = new Date(res.body.currentPeriodEnd).getTime();
    // ~30 days from now, not ~30 days from the 60-day-ago lapsed date.
    expect(newPeriodEnd).toBeGreaterThan(Date.now() + 25 * 24 * 60 * 60 * 1000);
  });

  it('suspend blocks the clinic immediately; reactivate restores it', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { token } = await setupPlatformSession();

    const suspend = await request(app).post(`/api/platform/clinics/${clinic.id}/subscription/suspend`).set(auth(token));
    expect(suspend.status).toBe(200);
    expect(suspend.body.status).toBe('SUSPENDED');
    expect((await request(app).get('/api/auth/me').set(auth(adminToken))).status).toBe(403);

    const reactivate = await request(app).post(`/api/platform/clinics/${clinic.id}/subscription/reactivate`).set(auth(token));
    expect(reactivate.status).toBe(200);
    expect(reactivate.body.status).toBe('ACTIVE');
    expect((await request(app).get('/api/auth/me').set(auth(adminToken))).status).toBe(200);
  });

  it('reactivate refuses a subscription that is also date-lapsed, and says to use renew instead', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    await prisma.subscription.update({
      where: { clinicId: clinic.id },
      data: { status: 'SUSPENDED', currentPeriodEnd: new Date(Date.now() - 1000) },
    });
    const { token } = await setupPlatformSession();

    const res = await request(app).post(`/api/platform/clinics/${clinic.id}/subscription/reactivate`).set(auth(token));
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/renew/i);
  });

  it('404s for a clinicId with no subscription record on renew/suspend/reactivate/payments', async () => {
    const { token } = await setupPlatformSession();
    const fakeId = '00000000-0000-0000-0000-000000000000';
    expect((await request(app).post(`/api/platform/clinics/${fakeId}/subscription/suspend`).set(auth(token))).status).toBe(404);
    expect((await request(app).post(`/api/platform/clinics/${fakeId}/subscription/reactivate`).set(auth(token))).status).toBe(404);
    expect((await request(app).get(`/api/platform/clinics/${fakeId}/subscription/payments`).set(auth(token))).status).toBe(404);
  });
});
