import request from 'supertest';
import { app, prisma, setupClinicWithAdmin, createUser, createDoctor, loginAs, auth, tomorrowDateStr } from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

// server/.env.test has no TWILIO_* vars configured, so every WhatsApp send
// in this file resolves via the stub adapter -- SENT with a fake
// providerMessageId when opted in, SKIPPED (not a failure) when not, same
// as the reminders.ts coverage in reminders.test.ts.

describe('Diet plans: CRUD + role gating + tenancy', () => {
  it('a doctor can create a diet plan for a patient; the patient can then read it back', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const docEmail = 'diet-doc@test.local';
    const { password: docPassword } = await createUser(clinic.id, 'DOCTOR', { email: docEmail });
    const docSession = await loginAs(clinic.slug, docEmail, docPassword);
    const patEmail = 'diet-patient@test.local';
    const { user: patient, password: patPassword } = await createUser(clinic.id, 'PATIENT', { email: patEmail });
    const patSession = await loginAs(clinic.slug, patEmail, patPassword);

    const created = await request(app)
      .post('/api/diet-plans')
      .set(auth(docSession.token))
      .send({
        patientId: patient.id,
        dietaryPreference: 'VEG',
        allergies: 'peanuts',
        localFoodNotes: 'seasonal local greens',
        planText: 'High-fiber vegetarian diet, avoid fried food.',
      });
    expect(created.status).toBe(201);
    expect(created.body.dietaryPreference).toBe('VEG');
    expect(created.body.createdByName).toBeTruthy();

    const list = await request(app)
      .get('/api/diet-plans')
      .query({ patientId: patient.id })
      .set(auth(patSession.token));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(created.body.id);
  });

  it('an admin can also create a diet plan; a nurse or the patient themself cannot', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { user: patient } = await createUser(clinic.id, 'PATIENT');
    const nurseEmail = 'diet-nurse@test.local';
    const { password: nursePassword } = await createUser(clinic.id, 'NURSE', { email: nurseEmail });
    const nurseSession = await loginAs(clinic.slug, nurseEmail, nursePassword);

    const asAdmin = await request(app)
      .post('/api/diet-plans')
      .set(auth(adminToken))
      .send({ patientId: patient.id, dietaryPreference: 'NON_VEG', planText: 'Balanced diet.' });
    expect(asAdmin.status).toBe(201);

    const asNurse = await request(app)
      .post('/api/diet-plans')
      .set(auth(nurseSession.token))
      .send({ patientId: patient.id, dietaryPreference: 'VEGAN', planText: 'x' });
    expect(asNurse.status).toBe(403);
  });

  it('a patient cannot read another patient\'s diet plans', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { user: patientA } = await createUser(clinic.id, 'PATIENT');
    const patientBEmail = 'diet-patient-b@test.local';
    const { password: patientBPassword } = await createUser(clinic.id, 'PATIENT', { email: patientBEmail });
    const patientBSession = await loginAs(clinic.slug, patientBEmail, patientBPassword);

    await request(app)
      .post('/api/diet-plans')
      .set(auth(adminToken))
      .send({ patientId: patientA.id, dietaryPreference: 'VEG', planText: 'x' });

    const res = await request(app)
      .get('/api/diet-plans')
      .query({ patientId: patientA.id })
      .set(auth(patientBSession.token));
    expect(res.status).toBe(403);
  });

  it('is tenant-scoped: a diet plan created in one clinic is invisible to staff in another, and cross-clinic patientId is rejected', async () => {
    const { clinic: clinicA, adminToken: adminA } = await setupClinicWithAdmin({ tier: 1 });
    const { user: patientA } = await createUser(clinicA.id, 'PATIENT');
    const { adminToken: adminB } = await setupClinicWithAdmin({ tier: 1 });

    const created = await request(app)
      .post('/api/diet-plans')
      .set(auth(adminA))
      .send({ patientId: patientA.id, dietaryPreference: 'VEG', planText: 'x' });
    expect(created.status).toBe(201);

    // Clinic B's admin can't create a plan for clinic A's patient.
    const crossCreate = await request(app)
      .post('/api/diet-plans')
      .set(auth(adminB))
      .send({ patientId: patientA.id, dietaryPreference: 'VEG', planText: 'x' });
    expect(crossCreate.status).toBe(404);

    // Clinic B's admin listing clinic A's patient sees nothing (scoped by clinicId, not just patientId).
    const crossList = await request(app)
      .get('/api/diet-plans')
      .query({ patientId: patientA.id })
      .set(auth(adminB));
    expect(crossList.status).toBe(200);
    expect(crossList.body).toHaveLength(0);
  });

  it('rejects a consultationId that does not belong to the given patient', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const { user: patientA } = await createUser(clinic.id, 'PATIENT');
    const { user: patientB } = await createUser(clinic.id, 'PATIENT');

    const appointment = await prisma.appointment.create({
      data: { clinicId: clinic.id, patientId: patientA.id, doctorId: doctorProfile.id, date: new Date(), tokenNumber: 1 },
    });
    const consultation = await prisma.consultation.create({ data: { appointmentId: appointment.id } });

    const res = await request(app)
      .post('/api/diet-plans')
      .set(auth(adminToken))
      .send({ patientId: patientB.id, consultationId: consultation.id, dietaryPreference: 'VEG', planText: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('WhatsApp opt-in self-toggle', () => {
  it('a user can toggle their own whatsappOptIn flag; defaults to false', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const email = 'optin-patient@test.local';
    const { password } = await createUser(clinic.id, 'PATIENT', { email });
    const session = await loginAs(clinic.slug, email, password);
    expect(session.user.whatsappOptIn).toBe(false);

    const toggled = await request(app).put('/api/auth/me/whatsapp-optin').set(auth(session.token)).send({ whatsappOptIn: true });
    expect(toggled.status).toBe(200);
    expect(toggled.body.whatsappOptIn).toBe(true);

    const me = await request(app).get('/api/auth/me').set(auth(session.token));
    expect(me.body.whatsappOptIn).toBe(true);
  });
});

describe('WhatsApp send: diet plan + prescription', () => {
  it('sending a diet plan via WhatsApp is SKIPPED (not a failure) when the patient has not opted in', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { user: patient } = await createUser(clinic.id, 'PATIENT', { phone: '+919876511111' });

    const plan = await request(app)
      .post('/api/diet-plans')
      .set(auth(adminToken))
      .send({ patientId: patient.id, dietaryPreference: 'VEG', planText: 'Eat well.' });

    const sent = await request(app).post(`/api/diet-plans/${plan.body.id}/send-whatsapp`).set(auth(adminToken));
    expect(sent.status).toBe(200);
    expect(sent.body.status).toBe('SKIPPED');
    expect(sent.body.error).toMatch(/not opted in/i);
    expect(sent.body.type).toBe('DIET_PLAN_SHARED');
  });

  it('sends a diet plan via the stub WhatsApp adapter once the patient has opted in', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { user: patient } = await createUser(clinic.id, 'PATIENT', { phone: '+919876522222' });
    await prisma.user.update({ where: { id: patient.id }, data: { whatsappOptIn: true } });

    const plan = await request(app)
      .post('/api/diet-plans')
      .set(auth(adminToken))
      .send({ patientId: patient.id, dietaryPreference: 'EGGETARIAN', planText: 'Protein-rich diet.' });

    const sent = await request(app).post(`/api/diet-plans/${plan.body.id}/send-whatsapp`).set(auth(adminToken));
    expect(sent.status).toBe(200);
    expect(sent.body.status).toBe('SENT');
    expect(sent.body.recipient).toBe('+919876522222');
    expect(sent.body.providerMessageId).toMatch(/^stub-/);

    const logged = await prisma.notification.findFirst({
      where: { clinicId: clinic.id, patientId: patient.id, type: 'DIET_PLAN_SHARED', channel: 'WHATSAPP' },
    });
    expect(logged).not.toBeNull();
  });

  it('a nurse cannot trigger a diet plan WhatsApp send', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { user: patient } = await createUser(clinic.id, 'PATIENT');
    const nurseEmail = 'diet-send-nurse@test.local';
    const { password: nursePassword } = await createUser(clinic.id, 'NURSE', { email: nurseEmail });
    const nurseSession = await loginAs(clinic.slug, nurseEmail, nursePassword);

    const plan = await request(app)
      .post('/api/diet-plans')
      .set(auth(adminToken))
      .send({ patientId: patient.id, dietaryPreference: 'VEG', planText: 'x' });

    const res = await request(app).post(`/api/diet-plans/${plan.body.id}/send-whatsapp`).set(auth(nurseSession.token));
    expect(res.status).toBe(403);
  });

  it('sends a prescription via WhatsApp once the consultation has prescriptions and the patient has opted in', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const docEmail = 'rx-doc@test.local';
    const { doctorProfile, password: docPassword } = await createDoctor(clinic.id, { email: docEmail });
    const docSession = await loginAs(clinic.slug, docEmail, docPassword);
    const patEmail = 'rx-patient@test.local';
    const { user: patient, password: patPassword } = await createUser(clinic.id, 'PATIENT', { email: patEmail, phone: '+919876533333' });
    await prisma.user.update({ where: { id: patient.id }, data: { whatsappOptIn: true } });
    const patSession = await loginAs(clinic.slug, patEmail, patPassword);

    const booked = await request(app)
      .post('/api/appointments')
      .set(auth(patSession.token))
      .send({ doctorId: doctorProfile.id, date: tomorrowDateStr(), startTime: '09:00' });
    expect(booked.status).toBe(201);

    const saved = await request(app)
      .put(`/api/consultations/${booked.body.id}`)
      .set(auth(docSession.token))
      .send({
        diagnosis: 'Common cold',
        prescriptions: [{ medicine: 'Paracetamol', dosage: '500mg', frequency: 'twice daily', durationDays: 3 }],
        complete: true,
      });
    expect(saved.status).toBe(200);

    const sent = await request(app).post(`/api/consultations/${booked.body.id}/send-prescription-whatsapp`).set(auth(docSession.token));
    expect(sent.status).toBe(200);
    expect(sent.body.status).toBe('SENT');
    expect(sent.body.type).toBe('PRESCRIPTION_SHARED');
    expect(sent.body.body).toMatch(/Paracetamol/);
  });

  it('rejects sending a prescription via WhatsApp when the consultation has no prescriptions', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const docEmail = 'rx-doc-2@test.local';
    const { doctorProfile, password: docPassword } = await createDoctor(clinic.id, { email: docEmail });
    const docSession = await loginAs(clinic.slug, docEmail, docPassword);
    const patEmail = 'rx-nopatient@test.local';
    const { password: patPassword } = await createUser(clinic.id, 'PATIENT', { email: patEmail });
    const patSession = await loginAs(clinic.slug, patEmail, patPassword);

    const booked = await request(app)
      .post('/api/appointments')
      .set(auth(patSession.token))
      .send({ doctorId: doctorProfile.id, date: tomorrowDateStr(), startTime: '09:15' });
    expect(booked.status).toBe(201);

    await request(app).put(`/api/consultations/${booked.body.id}`).set(auth(docSession.token)).send({ diagnosis: 'Nothing serious' });

    const sent = await request(app).post(`/api/consultations/${booked.body.id}/send-prescription-whatsapp`).set(auth(docSession.token));
    expect(sent.status).toBe(400);
  });
});
