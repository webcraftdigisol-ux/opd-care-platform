import request from 'supertest';
import { PATIENT_PORTAL_DISABLED_MESSAGE } from '@opd/shared';
import { app, prisma, setupClinicWithAdmin, createUser, loginAs, uniqueEmail, auth } from './helpers';

// .env.test switches the patient portal on for the other suites; this one
// covers the product default (off) and restores the flag afterwards.
const original = process.env.PATIENT_PORTAL_ENABLED;

afterEach(() => {
  process.env.PATIENT_PORTAL_ENABLED = original;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Patient portal switched off (the default)', () => {
  it('refuses patient self-registration', async () => {
    const { clinic } = await setupClinicWithAdmin();
    delete process.env.PATIENT_PORTAL_ENABLED;

    const res = await request(app).post('/api/auth/register').send({
      clinicSlug: clinic.slug,
      name: 'New Patient',
      email: uniqueEmail('patient'),
      password: 'password123',
    });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe(PATIENT_PORTAL_DISABLED_MESSAGE);
  });

  it('refuses patient login, and a patient token issued earlier stops working', async () => {
    const { clinic } = await setupClinicWithAdmin();
    const { user, password } = await createUser(clinic.id, 'PATIENT');
    const { token } = await loginAs(clinic.slug, user.email, password);

    delete process.env.PATIENT_PORTAL_ENABLED;

    const login = await request(app).post('/api/auth/login').send({ clinicSlug: clinic.slug, email: user.email, password });
    expect(login.status).toBe(403);
    expect(login.body.message).toBe(PATIENT_PORTAL_DISABLED_MESSAGE);

    const me = await request(app).get('/api/auth/me').set(auth(token));
    expect(me.status).toBe(403);
    expect(me.body.message).toBe(PATIENT_PORTAL_DISABLED_MESSAGE);
  });

  it('a wrong password still reads as invalid credentials, not as the portal being off', async () => {
    const { clinic } = await setupClinicWithAdmin();
    const { user } = await createUser(clinic.id, 'PATIENT');
    delete process.env.PATIENT_PORTAL_ENABLED;

    const res = await request(app).post('/api/auth/login').send({ clinicSlug: clinic.slug, email: user.email, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('staff are unaffected: admin and doctor still log in and use the API', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin();
    const { user: doctor, password } = await createUser(clinic.id, 'DOCTOR');
    delete process.env.PATIENT_PORTAL_ENABLED;

    expect((await request(app).get('/api/auth/me').set(auth(adminToken))).status).toBe(200);
    const { token } = await loginAs(clinic.slug, doctor.email, password);
    expect((await request(app).get('/api/auth/me').set(auth(token))).status).toBe(200);
  });
});
