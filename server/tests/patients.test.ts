import request from 'supertest';
import { app, prisma, setupClinicWithAdmin, createUser, createDoctor, loginAs, uniqueEmail, auth } from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

async function staffToken(clinicId: string, clinicSlug: string, role: 'RECEPTIONIST' | 'DOCTOR' | 'PHARMACIST') {
  const email = uniqueEmail(role.toLowerCase());
  await createUser(clinicId, role, { email });
  return (await loginAs(clinicSlug, email, 'password123')).token;
}

function register(token: string, body: Record<string, unknown>) {
  return request(app).post('/api/patients').set(auth(token)).send(body);
}

describe('Patient registration', () => {
  it('gives each clinic its own sequential Patient IDs and keeps every field', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const other = await setupClinicWithAdmin({ tier: 1 });

    const first = await register(adminToken, {
      firstName: 'Prasad',
      middleName: 'P',
      lastName: 'Kulkarni',
      gender: 'MALE',
      dateOfBirth: '1990-05-17',
      bloodGroup: 'B+',
      maritalStatus: 'Married',
      nationality: 'Indian',
      phone: '9876543210',
      alternatePhone: '9123456789',
      emergencyContact: 'Asha (9000000000)',
      occupation: 'Engineer',
      referredBy: 'Dr. Rao',
      address: '12 MG Road',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
      heightCm: 172,
      weightKg: 92,
      allergies: 'Penicillin',
      chronicDiseases: 'Type 2 diabetes',
      pastSurgeries: 'Appendectomy 2015',
      familyHistory: 'Father: hypertension',
      insuranceDetails: 'Star Health 123',
      tpa: 'MediAssist',
      doctorNotes: 'Prefers morning slots',
    });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      patientCode: 'PT000001',
      name: 'Prasad P Kulkarni',
      gender: 'MALE',
      dateOfBirth: '1990-05-17',
      email: null, // placeholder emails are never shown
      city: 'Pune',
      heightCm: 172,
      allergies: 'Penicillin',
      tpa: 'MediAssist',
    });
    expect(first.body.age).toBeGreaterThanOrEqual(35);

    const second = await register(adminToken, { firstName: 'Asha', phone: '9876543210' });
    expect(second.body.patientCode).toBe('PT000002');

    const elsewhere = await register(other.adminToken, { firstName: 'Zoe', phone: '9000000001' });
    expect(elsewhere.body.patientCode).toBe('PT000001');
    expect(clinic.id).not.toBe(other.clinic.id);
  });

  it('lets family members share one mobile number as separate patients', async () => {
    const { adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const a = await register(adminToken, { firstName: 'Ravi', phone: '9811122233' });
    const b = await register(adminToken, { firstName: 'Sita', phone: '98111 22233' });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).not.toBe(b.body.id);
  });

  it('only needs a first name and mobile, and derives age when only an age is given', async () => {
    const { adminToken } = await setupClinicWithAdmin({ tier: 1 });
    expect((await register(adminToken, { phone: '9811122233' })).status).toBe(400);
    expect((await register(adminToken, { firstName: 'Ravi' })).status).toBe(400);

    const res = await register(adminToken, { firstName: 'Ravi', phone: '9811122233', ageYears: 40 });
    expect(res.status).toBe(201);
    expect(res.body.age).toBe(40);

    // Two years on, the recorded age has moved on with it.
    await prisma.patientProfile.update({
      where: { userId: res.body.id },
      data: { ageRecordedAt: new Date(Date.now() - 2.1 * 365 * 24 * 3600 * 1000) },
    });
    const later = await request(app).get(`/api/patients/${res.body.id}`).set(auth(adminToken));
    expect(later.body.age).toBe(42);
  });

  it('refuses an email already used at the clinic', async () => {
    const { adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const email = uniqueEmail('dup');
    expect((await register(adminToken, { firstName: 'A', phone: '9811100001', email })).status).toBe(201);
    expect((await register(adminToken, { firstName: 'B', phone: '9811100002', email })).status).toBe(409);
  });

  it('is open to reception and doctors but not to other staff', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 2 });
    const reception = await staffToken(clinic.id, clinic.slug, 'RECEPTIONIST');
    const doctor = await staffToken(clinic.id, clinic.slug, 'DOCTOR');
    const pharmacist = await staffToken(clinic.id, clinic.slug, 'PHARMACIST');
    expect((await register(reception, { firstName: 'A', phone: '9811100001' })).status).toBe(201);
    expect((await register(doctor, { firstName: 'B', phone: '9811100002' })).status).toBe(201);
    expect((await register(pharmacist, { firstName: 'C', phone: '9811100003' })).status).toBe(403);
  });

  it('self-signup patients get a Patient ID too', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ clinicSlug: clinic.slug, name: 'Meera Joshi', email: uniqueEmail('self'), phone: '9822200000', password: 'secret123' });
    expect(res.status).toBe(201);
    const profile = await prisma.patientProfile.findUniqueOrThrow({ where: { userId: res.body.user.id } });
    expect(profile).toMatchObject({ patientCode: 'PT000001', firstName: 'Meera', lastName: 'Joshi' });
  });
});

describe('Patient search', () => {
  async function seed() {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const kulkarni = await register(adminToken, { firstName: 'Prasad', lastName: 'Kulkarni', phone: '+91 98765 43210', gender: 'MALE', ageYears: 35 });
    const wife = await register(adminToken, { firstName: 'Asha', lastName: 'Kulkarni', phone: '9876543210', gender: 'FEMALE' });
    const other = await register(adminToken, { firstName: 'Ravi', lastName: 'Deshpande', phone: '9000011111', alternatePhone: '9555566666' });
    return { clinic, adminToken, kulkarni: kulkarni.body, wife: wife.body, other: other.body };
  }
  const search = (token: string, q: string) => request(app).get('/api/patients/search').query({ q }).set(auth(token));

  it('matches any part of the name, ignoring case', async () => {
    const { adminToken } = await seed();
    const res = await search(adminToken, 'KULK');
    expect(res.status).toBe(200);
    expect(res.body.map((p: any) => p.name).sort()).toEqual(['Asha Kulkarni', 'Prasad Kulkarni']);
  });

  it('matches a mobile number however it is typed, including the alternate number', async () => {
    const { adminToken, other } = await seed();
    expect((await search(adminToken, '98765-43210')).body).toHaveLength(2);
    expect((await search(adminToken, '+919876543210')).body).toHaveLength(2);
    expect((await search(adminToken, '43210')).body).toHaveLength(2);
    const alt = await search(adminToken, '95555');
    expect(alt.body.map((p: any) => p.id)).toEqual([other.id]);
  });

  it('matches a Patient ID with or without the PT prefix, and shows who is who', async () => {
    const { adminToken, wife } = await seed();
    const withPrefix = await search(adminToken, 'pt000002');
    expect(withPrefix.body.map((p: any) => p.id)).toEqual([wife.id]);
    const bare = await search(adminToken, '2');
    expect(bare.body.map((p: any) => p.id)).toContain(wife.id);
    expect(withPrefix.body[0]).toMatchObject({ patientCode: 'PT000002', gender: 'FEMALE', phone: '9876543210', lastVisit: null });
  });

  it('reports the last visit and never shows another clinic\'s patients', async () => {
    const { clinic, adminToken, kulkarni } = await seed();
    const { doctorProfile } = await createDoctor(clinic.id);
    await request(app)
      .post('/api/appointments/walk-in')
      .set(auth(adminToken))
      .send({ doctorId: doctorProfile.id, patientId: kulkarni.id });
    const res = await search(adminToken, 'prasad');
    expect(res.body[0].lastVisit).toBe(new Date().toISOString().slice(0, 10));

    const other = await setupClinicWithAdmin({ tier: 1 });
    expect((await search(other.adminToken, 'kulkarni')).body).toEqual([]);
  });

  it('lists the newest registrations for the dashboard', async () => {
    const { adminToken, other } = await seed();
    const res = await request(app).get('/api/patients/recent').query({ limit: 2 }).set(auth(adminToken));
    expect(res.body).toHaveLength(2);
    expect(res.body[0].id).toBe(other.id);
  });
});

describe('Patient profile', () => {
  it('can be read and edited by staff, and read by the patient themself', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const created = await register(adminToken, { firstName: 'Ravi', phone: '9811122233' });

    const edited = await request(app)
      .put(`/api/patients/${created.body.id}`)
      .set(auth(adminToken))
      .send({ firstName: 'Ravi', lastName: 'Kumar', phone: '9811122233', allergies: 'Sulfa', city: '' });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ name: 'Ravi Kumar', allergies: 'Sulfa', city: null, patientCode: 'PT000001' });

    const reception = await staffToken(clinic.id, clinic.slug, 'RECEPTIONIST');
    expect((await request(app).get(`/api/patients/${created.body.id}`).set(auth(reception))).status).toBe(200);

    const email = uniqueEmail('self');
    const { user } = await createUser(clinic.id, 'PATIENT', { email });
    const selfToken = (await loginAs(clinic.slug, email, 'password123')).token;
    expect((await request(app).get(`/api/patients/${user.id}`).set(auth(selfToken))).status).toBe(200);
    expect((await request(app).get(`/api/patients/${created.body.id}`).set(auth(selfToken))).status).toBe(403);
    expect(
      (await request(app).put(`/api/patients/${user.id}`).set(auth(selfToken)).send({ firstName: 'X', phone: '9811100000' })).status,
    ).toBe(403);
  });

  it('keeps a real email unless it is cleared, and hides placeholders', async () => {
    const { adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const email = uniqueEmail('real');
    const created = await register(adminToken, { firstName: 'A', phone: '9811100001', email });
    expect(created.body.email).toBe(email);
    const cleared = await request(app)
      .put(`/api/patients/${created.body.id}`)
      .set(auth(adminToken))
      .send({ firstName: 'A', phone: '9811100001', email: '' });
    expect(cleared.body.email).toBeNull();
  });

  it('is 404 for a patient of another clinic', async () => {
    const { adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const other = await setupClinicWithAdmin({ tier: 1 });
    const created = await register(other.adminToken, { firstName: 'A', phone: '9811100001' });
    expect((await request(app).get(`/api/patients/${created.body.id}`).set(auth(adminToken))).status).toBe(404);
  });
});

describe('Walk-in registration', () => {
  it('books an existing patient by id, and never merges a new walk-in into someone sharing the mobile', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const father = await register(adminToken, { firstName: 'Ravi', phone: '9811122233' });

    const byId = await request(app)
      .post('/api/appointments/walk-in')
      .set(auth(adminToken))
      .send({ doctorId: doctorProfile.id, patientId: father.body.id });
    expect(byId.status).toBe(201);
    expect(byId.body.patientId).toBe(father.body.id);
    expect(byId.body.patient.patientCode).toBe('PT000001');

    const daughter = await request(app)
      .post('/api/appointments/walk-in')
      .set(auth(adminToken))
      .send({ doctorId: doctorProfile.id, patientName: 'Priya Rao', patientPhone: '9811122233' });
    expect(daughter.status).toBe(201);
    expect(daughter.body.patientId).not.toBe(father.body.id);
    expect(daughter.body.patient.patientCode).toBe('PT000002');
    expect(daughter.body.tokenNumber).toBe(2);
  });

  it('needs either a patient id or a name and mobile', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const res = await request(app)
      .post('/api/appointments/walk-in')
      .set(auth(adminToken))
      .send({ doctorId: doctorProfile.id, patientName: 'No Phone' });
    expect(res.status).toBe(400);

    const other = await setupClinicWithAdmin({ tier: 1 });
    const stranger = await register(other.adminToken, { firstName: 'A', phone: '9811100001' });
    const cross = await request(app)
      .post('/api/appointments/walk-in')
      .set(auth(adminToken))
      .send({ doctorId: doctorProfile.id, patientId: stranger.body.id });
    expect(cross.status).toBe(404);
  });
});

describe('Patient billing', () => {
  it('lists attended visits as OPD bills with what has been paid, newest first', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id, { consultationFee: 500 });
    const patient = await register(adminToken, { firstName: 'Ravi', phone: '9811122233' });

    const visit = await request(app)
      .post('/api/appointments/walk-in')
      .set(auth(adminToken))
      .send({ doctorId: doctorProfile.id, patientId: patient.body.id });
    await request(app)
      .post('/api/payments')
      .set(auth(adminToken))
      .send({ billType: 'CONSULTATION', billId: visit.body.id, amount: 200, method: 'CASH' });

    const res = await request(app).get(`/api/patients/${patient.body.id}/billing`).set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ totalBilled: 500, totalPaid: 200, totalDue: 300 });
    expect(res.body.bills).toHaveLength(1);
    expect(res.body.bills[0]).toMatchObject({ billType: 'CONSULTATION', total: 500, amountPaid: 200, balanceDue: 300 });
    expect(res.body.bills[0].label).toMatch(/^OPD consultation — Visit 1/);

    // Reception can see consultation bills; a pharmacist sees none of them.
    const reception = await staffToken(clinic.id, clinic.slug, 'RECEPTIONIST');
    expect((await request(app).get(`/api/patients/${patient.body.id}/billing`).set(auth(reception))).body.bills).toHaveLength(1);
    const pharmacist = await staffToken(clinic.id, clinic.slug, 'PHARMACIST');
    expect((await request(app).get(`/api/patients/${patient.body.id}/billing`).set(auth(pharmacist))).body.bills).toHaveLength(0);
  });
});

describe('Admin can act as any role', () => {
  it('can record a consultation (single-doctor clinics: the owner is the doctor)', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const patient = await register(adminToken, { firstName: 'Ravi', phone: '9811122233' });
    const visit = await request(app)
      .post('/api/appointments/walk-in')
      .set(auth(adminToken))
      .send({ doctorId: doctorProfile.id, patientId: patient.body.id });

    const res = await request(app)
      .put(`/api/consultations/${visit.body.id}`)
      .set(auth(adminToken))
      .send({ diagnosis: 'Viral fever', complete: true });
    expect(res.status).toBe(200);
    expect(res.body.diagnosis).toBe('Viral fever');
  });
});
