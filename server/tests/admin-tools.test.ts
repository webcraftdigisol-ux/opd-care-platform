import request from 'supertest';
import { app, prisma, setupClinicWithAdmin, createUser, createDoctor, loginAs, uniqueEmail, auth } from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

const PDF = Buffer.from('%PDF-1.4\n%test\n');

function dateOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const login = (clinicSlug: string, email: string, password: string) =>
  request(app).post('/api/auth/login').send({ clinicSlug, email, password });

describe('Staff accounts', () => {
  it('creates a username-only receptionist who signs in with the username', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const res = await request(app)
      .post('/api/admin/staff')
      .set(auth(adminToken))
      .send({ name: 'Rekha Desk', username: 'Rekha.Desk', password: 'temp123', role: 'RECEPTIONIST' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ username: 'rekha.desk', role: 'RECEPTIONIST', active: true });

    const ok = await login(clinic.slug, 'REKHA.desk', 'temp123');
    expect(ok.status).toBe(200);
    expect(ok.body.user.name).toBe('Rekha Desk');

    // Taken usernames and bad formats are refused; one of username/email is needed.
    const dup = await request(app).post('/api/admin/staff').set(auth(adminToken)).send({ name: 'X Y', username: 'rekha.desk', password: 'temp123', role: 'NURSE' });
    expect(dup.status).toBe(409);
    const spaces = await request(app).post('/api/admin/staff').set(auth(adminToken)).send({ name: 'X Y', username: 'has space', password: 'temp123', role: 'NURSE' });
    expect(spaces.status).toBe(400);
    const neither = await request(app).post('/api/admin/staff').set(auth(adminToken)).send({ name: 'X Y', password: 'temp123', role: 'NURSE' });
    expect(neither.status).toBe(400);
  });

  it('deactivating blocks sign-in and ends the live session; reactivating restores it', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const staff = await request(app).post('/api/admin/staff').set(auth(adminToken)).send({ name: 'Nita Nurse', username: 'nita', password: 'temp123', role: 'NURSE' });
    const session = (await login(clinic.slug, 'nita', 'temp123')).body.token;
    expect((await request(app).get('/api/auth/me').set(auth(session))).status).toBe(200);

    const off = await request(app).patch(`/api/admin/staff/${staff.body.id}`).set(auth(adminToken)).send({ active: false });
    expect(off.body.active).toBe(false);
    expect((await request(app).get('/api/auth/me').set(auth(session))).status).toBe(401);
    const refused = await login(clinic.slug, 'nita', 'temp123');
    expect(refused.status).toBe(403);
    expect(refused.body.message).toMatch(/deactivated/);
    // A wrong password on a deactivated account still just says "invalid".
    expect((await login(clinic.slug, 'nita', 'wrong-pass')).status).toBe(401);

    await request(app).patch(`/api/admin/staff/${staff.body.id}`).set(auth(adminToken)).send({ active: true });
    expect((await login(clinic.slug, 'nita', 'temp123')).status).toBe(200);
  });

  it('admin resets a password and changes a role', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 2 });
    const staff = await request(app).post('/api/admin/staff').set(auth(adminToken)).send({ name: 'Raj', username: 'raj', password: 'temp123', role: 'RECEPTIONIST' });
    const reset = await request(app).post(`/api/admin/staff/${staff.body.id}/reset-password`).set(auth(adminToken)).send({ password: 'newpass1' });
    expect(reset.status).toBe(200);
    expect((await login(clinic.slug, 'raj', 'temp123')).status).toBe(401);
    expect((await login(clinic.slug, 'raj', 'newpass1')).status).toBe(200);

    const role = await request(app).patch(`/api/admin/staff/${staff.body.id}`).set(auth(adminToken)).send({ role: 'PHARMACIST' });
    expect(role.body.role).toBe('PHARMACIST');
    expect((await request(app).post(`/api/admin/staff/${staff.body.id}/reset-password`).set(auth(adminToken)).send({ password: '123' })).status).toBe(400);
  });

  it('never lets the clinic lock itself out', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const me = (await request(app).get('/api/auth/me').set(auth(adminToken))).body;
    expect((await request(app).patch(`/api/admin/staff/${me.id}`).set(auth(adminToken)).send({ active: false })).status).toBe(400);
    expect((await request(app).patch(`/api/admin/staff/${me.id}`).set(auth(adminToken)).send({ role: 'NURSE' })).status).toBe(400);

    // Another admin can't remove the only other active admin either.
    const second = await request(app).post('/api/admin/staff').set(auth(adminToken)).send({ name: 'Second Admin', username: 'admin2', password: 'temp123', role: 'ADMIN' });
    const secondToken = (await login(clinic.slug, 'admin2', 'temp123')).body.token;
    expect((await request(app).patch(`/api/admin/staff/${me.id}`).set(auth(secondToken)).send({ active: false })).status).toBe(200);
    expect((await request(app).patch(`/api/admin/staff/${second.body.id}`).set(auth(adminToken)).send({ active: false })).status).toBe(401); // first admin is now signed out

    // A doctor's role isn't changed here.
    const { user: doctor } = await createDoctor(clinic.id);
    expect((await request(app).patch(`/api/admin/staff/${doctor.id}`).set(auth(secondToken)).send({ role: 'NURSE' })).status).toBe(400);
    // Staff can't manage staff.
    const email = uniqueEmail('rec');
    await createUser(clinic.id, 'RECEPTIONIST', { email });
    const rec = (await loginAs(clinic.slug, email, 'password123')).token;
    expect((await request(app).get('/api/admin/staff').set(auth(rec))).status).toBe(403);
  });
});

describe('Revenue report (transactions)', () => {
  it('lists each bill in range with billed vs collected, by day, type and payment mode, and filters by doctor', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const a = await createDoctor(clinic.id, { consultationFee: 500 });
    const b = await createDoctor(clinic.id, { consultationFee: 800 });
    const p1 = await request(app).post('/api/patients').set(auth(adminToken)).send({ firstName: 'Ravi', phone: '9811100001' });
    const p2 = await request(app).post('/api/patients').set(auth(adminToken)).send({ firstName: 'Sita', phone: '9811100002' });
    const v1 = await request(app).post('/api/appointments/walk-in').set(auth(adminToken)).send({ doctorId: a.doctorProfile.id, patientId: p1.body.id });
    const v2 = await request(app).post('/api/appointments/walk-in').set(auth(adminToken)).send({ doctorId: b.doctorProfile.id, patientId: p2.body.id });
    await request(app).post('/api/payments').set(auth(adminToken)).send({ billType: 'CONSULTATION', billId: v1.body.id, amount: 500, method: 'UPI' });
    await request(app).post('/api/payments').set(auth(adminToken)).send({ billType: 'CONSULTATION', billId: v2.body.id, amount: 300, method: 'CASH' });
    // A booking for tomorrow isn't a bill yet.
    await request(app).post('/api/appointments/schedule').set(auth(adminToken)).send({ doctorId: a.doctorProfile.id, date: dateOffset(1), patientId: p1.body.id });

    const from = dateOffset(-1);
    const to = dateOffset(1);
    const res = await request(app).get('/api/reports/transactions').query({ from, to }).set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.totals).toEqual({ count: 2, billed: 1300, collected: 800, outstanding: 500 });
    const byId = Object.fromEntries(res.body.rows.map((r: any) => [r.billId, r]));
    expect(byId[v1.body.id]).toMatchObject({ billType: 'CONSULTATION', billed: 500, collected: 500, status: 'PAID', patientCode: 'PT000001' });
    expect(byId[v2.body.id]).toMatchObject({ billed: 800, collected: 300, outstanding: 500, status: 'PARTLY_PAID' });
    expect(res.body.byType).toEqual([{ billType: 'CONSULTATION', count: 2, billed: 1300, collected: 800 }]);
    expect(res.body.byMethod).toEqual(expect.arrayContaining([{ method: 'UPI', amount: 500 }, { method: 'CASH', amount: 300 }]));

    const onlyB = await request(app).get('/api/reports/transactions').query({ from, to, doctorId: b.doctorProfile.id }).set(auth(adminToken));
    expect(onlyB.body.rows.map((r: any) => r.billId)).toEqual([v2.body.id]);

    // A doctor sees only their own, whatever they ask for.
    const docToken = (await loginAs(clinic.slug, a.user.email, 'password123')).token;
    const mine = await request(app).get('/api/reports/transactions').query({ from, to, doctorId: b.doctorProfile.id }).set(auth(docToken));
    expect(mine.body.rows.map((r: any) => r.billId)).toEqual([v1.body.id]);

    expect((await request(app).get('/api/reports/transactions').query({ from: to, to: from }).set(auth(adminToken))).status).toBe(400);
    expect((await request(app).get('/api/reports/transactions').query({ from: '2020-01-01', to }).set(auth(adminToken))).status).toBe(400);
  });
});

describe('Patient-level files', () => {
  it('files an outside report and image straight to the patient, visible on their records', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const p = await request(app).post('/api/patients').set(auth(adminToken)).send({ firstName: 'Ravi', phone: '9811100001' });
    const up = await request(app)
      .post('/api/attachments')
      .set(auth(adminToken))
      .field('category', 'PATIENT_REPORT')
      .field('entityId', p.body.id)
      .attach('file', PDF, { filename: 'outside-cbc.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(201);
    expect(up.body).toMatchObject({ category: 'PATIENT_REPORT', patientId: p.body.id, fileName: 'outside-cbc.pdf' });

    const list = await request(app).get('/api/attachments').query({ category: 'PATIENT_REPORT', entityId: p.body.id }).set(auth(adminToken));
    expect(list.body).toHaveLength(1);
    const records = await request(app).get(`/api/patients/${p.body.id}/records`).set(auth(adminToken));
    expect(records.body.attachments.map((a: any) => a.fileName)).toContain('outside-cbc.pdf');

    // Reception can file one; a pharmacist can't; another clinic's patient is 404.
    const email = uniqueEmail('rec');
    await createUser(clinic.id, 'RECEPTIONIST', { email });
    const rec = (await loginAs(clinic.slug, email, 'password123')).token;
    const byDesk = await request(app)
      .post('/api/attachments')
      .set(auth(rec))
      .field('category', 'PATIENT_IMAGE')
      .field('entityId', p.body.id)
      .attach('file', PDF, { filename: 'scan.pdf', contentType: 'application/pdf' });
    expect(byDesk.status).toBe(201);
    const other = await setupClinicWithAdmin({ tier: 1 });
    const cross = await request(app)
      .post('/api/attachments')
      .set(auth(other.adminToken))
      .field('category', 'PATIENT_REPORT')
      .field('entityId', p.body.id)
      .attach('file', PDF, { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(cross.status).toBe(404);
  });
});
