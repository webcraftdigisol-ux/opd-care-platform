import request from 'supertest';
import { app, prisma, createClinic, createUser, loginAs, uniqueEmail, auth } from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('multi-tenancy isolation', () => {
  it('rejects login when the email exists but under a different clinic slug', async () => {
    const clinicA = await createClinic({ slug: undefined, name: 'Clinic A' });
    const email = uniqueEmail('shared');
    await createUser(clinicA.id, 'ADMIN', { email, password: 'correcthorse1' });

    const clinicB = await createClinic({ name: 'Clinic B' });

    // Right email/password, but wrong clinic slug -- must fail, because the
    // (clinicId, email) pair is what's actually unique, not email alone.
    const res = await request(app)
      .post('/api/auth/login')
      .send({ clinicSlug: clinicB.slug, email, password: 'correcthorse1' });
    expect(res.status).toBe(401);
  });

  it("a clinic's staff cannot fetch another clinic's patient by ID", async () => {
    const clinicA = await createClinic({ name: 'Clinic A' });
    const clinicB = await createClinic({ name: 'Clinic B' });

    const { user: patientA } = await createUser(clinicA.id, 'PATIENT');
    const emailB = uniqueEmail('admin-b');
    const { password: passwordB } = await createUser(clinicB.id, 'ADMIN', { email: emailB });
    const sessionB = await loginAs(clinicB.slug, emailB, passwordB);

    const res = await request(app)
      .get(`/api/patients/${patientA.id}/records`)
      .set(auth(sessionB.token));

    expect(res.status).toBe(404);
  });

  it("a clinic's doctors are invisible to another clinic's staff", async () => {
    const clinicA = await createClinic({ name: 'Clinic A' });
    const clinicB = await createClinic({ name: 'Clinic B' });

    const emailA = uniqueEmail('admin-a');
    const { password: passwordA } = await createUser(clinicA.id, 'ADMIN', { email: emailA });
    const sessionA = await loginAs(clinicA.slug, emailA, passwordA);

    await request(app)
      .post('/api/admin/doctors')
      .set(auth(sessionA.token))
      .send({
        name: 'Dr. Clinic A',
        email: uniqueEmail('doctor-a'),
        password: 'password123',
        specialization: 'Cardiology',
        department: 'OPD',
      })
      .expect(201);

    const emailB = uniqueEmail('admin-b');
    const { password: passwordB } = await createUser(clinicB.id, 'ADMIN', { email: emailB });
    const sessionB = await loginAs(clinicB.slug, emailB, passwordB);

    const res = await request(app).get('/api/doctors').set(auth(sessionB.token));
    expect(res.status).toBe(200);
    expect(res.body.find((d: any) => d.user.name === 'Dr. Clinic A')).toBeUndefined();
  });

  it('clinic self-registration creates an isolated clinic with its own admin', async () => {
    const res = await request(app)
      .post('/api/clinics/register')
      .send({
        clinicName: 'New Clinic',
        clinicSlug: `new-clinic-${Date.now()}`,
        adminName: 'New Admin',
        adminEmail: uniqueEmail('new-admin'),
        adminPassword: 'password123',
      });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('ADMIN');
    expect(res.body.clinic.tier).toBe(1);
  });

  it('rejects registering a clinic slug that is already taken', async () => {
    const clinic = await createClinic();
    const res = await request(app)
      .post('/api/clinics/register')
      .send({
        clinicName: 'Duplicate',
        clinicSlug: clinic.slug,
        adminName: 'Someone',
        adminEmail: uniqueEmail('dup'),
        adminPassword: 'password123',
      });
    expect(res.status).toBe(409);
  });
});
