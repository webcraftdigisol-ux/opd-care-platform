import request from 'supertest';
import { app, prisma, setupClinicWithAdmin, createUser, createDoctor, loginAs, auth, tomorrowDateStr } from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

// server/.env.test intentionally has no SMTP_* vars, so every send in this
// file resolves to SKIPPED -- that's the expected, testable outcome: the
// pipeline still creates a full audit record without a real mail provider.

describe('Notifications: every attempt is logged, sent or not', () => {
  it('booking an appointment logs an APPOINTMENT_CONFIRMED notification to the patient\'s real email', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const email = 'real-patient@test.local';
    const { password } = await createUser(clinic.id, 'PATIENT', { email });
    const session = await loginAs(clinic.slug, email, password);

    const appt = await request(app)
      .post('/api/appointments')
      .set(auth(session.token))
      .send({ doctorId: doctorProfile.id, date: tomorrowDateStr(), startTime: '09:00' });
    expect(appt.status).toBe(201);

    const notification = await prisma.notification.findFirst({
      where: { clinicId: clinic.id, type: 'APPOINTMENT_CONFIRMED', patientId: appt.body.patientId },
      orderBy: { createdAt: 'desc' },
    });
    expect(notification).not.toBeNull();
    expect(notification!.recipient).toBe(email);
    expect(notification!.status).toBe('SKIPPED');
    expect(notification!.error).toMatch(/SMTP not configured/);
  });

  it('a walk-in with only a synthetic placeholder email is correctly skipped as "no usable recipient"', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);

    const walkIn = await request(app)
      .post('/api/appointments/walk-in')
      .set(auth(adminToken))
      .send({ doctorId: doctorProfile.id, patientName: 'No Email Patient', patientPhone: '9988776655' });
    expect(walkIn.status).toBe(201);

    const notification = await prisma.notification.findFirst({
      where: { clinicId: clinic.id, type: 'APPOINTMENT_CONFIRMED', patientId: walkIn.body.patientId },
    });
    expect(notification!.status).toBe('SKIPPED');
    expect(notification!.error).toMatch(/No usable recipient/);
    expect(notification!.recipient).toMatch(/^patient-.*@opd\.local$/);
  });

  it('recording a payment logs a PAYMENT_RECEIVED notification', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id, { consultationFee: 400 });
    const walkIn = await request(app)
      .post('/api/appointments/walk-in')
      .set(auth(adminToken))
      .send({ doctorId: doctorProfile.id, patientName: 'Payer', patientPhone: '9988776656' });

    await request(app)
      .post('/api/payments')
      .set(auth(adminToken))
      .send({ billType: 'CONSULTATION', billId: walkIn.body.id, amount: 400, method: 'CASH' });

    const notification = await prisma.notification.findFirst({
      where: { clinicId: clinic.id, type: 'PAYMENT_RECEIVED', patientId: walkIn.body.patientId },
    });
    expect(notification).not.toBeNull();
    expect(notification!.body).toMatch(/fully paid/);
  });

  it('discharging an IPD admission logs a DISCHARGE_SUMMARY notification', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 3 });
    const { user: patient } = await createUser(clinic.id, 'PATIENT');
    const { doctorProfile } = await createDoctor(clinic.id);
    const ward = await prisma.ward.create({ data: { clinicId: clinic.id, name: 'General' } });
    const bed = await prisma.bed.create({ data: { wardId: ward.id, label: 'G-1', dailyRate: 1000 } });
    const admission = await request(app)
      .post('/api/ipd/admissions')
      .set(auth(adminToken))
      .send({ patientId: patient.id, bedId: bed.id, admittingDoctorId: doctorProfile.id });

    await request(app).post(`/api/ipd/admissions/${admission.body.id}/discharge`).set(auth(adminToken)).send({});

    const notification = await prisma.notification.findFirst({
      where: { clinicId: clinic.id, type: 'DISCHARGE_SUMMARY', patientId: patient.id },
    });
    expect(notification).not.toBeNull();
  });

  it('the follow-up reminder endpoint logs a FOLLOWUP_REMINDER notification and requires Admin/Doctor', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const { user: patient } = await createUser(clinic.id, 'PATIENT');
    const appointment = await prisma.appointment.create({
      data: { clinicId: clinic.id, patientId: patient.id, doctorId: doctorProfile.id, date: new Date(), tokenNumber: 1 },
    });
    const consultation = await prisma.consultation.create({
      data: { appointmentId: appointment.id, followUpDate: new Date() },
    });

    const receptionistEmail = 'reception-followup@test.local';
    await createUser(clinic.id, 'RECEPTIONIST', { email: receptionistEmail, password: 'password123' });
    const receptionistSession = await loginAs(clinic.slug, receptionistEmail, 'password123');
    expect(
      (await request(app).post(`/api/reports/follow-ups/${consultation.id}/remind`).set(auth(receptionistSession.token))).status,
    ).toBe(403);

    const remind = await request(app).post(`/api/reports/follow-ups/${consultation.id}/remind`).set(auth(adminToken));
    expect(remind.status).toBe(201);
    expect(remind.body.email.type).toBe('FOLLOWUP_REMINDER');
    expect(remind.body.whatsapp).toMatchObject({ type: 'FOLLOWUP_REMINDER', channel: 'WHATSAPP', status: 'SKIPPED' });
  });

  it('GET /admin/notifications lists recent notifications, Admin-only', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    await request(app)
      .post('/api/appointments/walk-in')
      .set(auth(adminToken))
      .send({ doctorId: doctorProfile.id, patientName: 'Someone', patientPhone: '9988776657' });

    const list = await request(app).get('/api/admin/notifications').set(auth(adminToken));
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThan(0);

    const doctorEmail = 'doc-notif-check@test.local';
    const { password } = await createUser(clinic.id, 'DOCTOR', { email: doctorEmail });
    const doctorSession = await loginAs(clinic.slug, doctorEmail, password);
    expect((await request(app).get('/api/admin/notifications').set(auth(doctorSession.token))).status).toBe(403);
  });
});

describe('WhatsApp consent recorded at walk-in registration', () => {
  it('records consent, who recorded it and when, and never revokes it on a later visit', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const admin = await prisma.user.findFirstOrThrow({ where: { clinicId: clinic.id, role: 'ADMIN' } });
    const { doctorProfile } = await createDoctor(clinic.id);
    const phone = `98${Math.floor(10000000 + Math.random() * 89999999)}`;

    const first = await request(app)
      .post('/api/appointments/walk-in')
      .set(auth(adminToken))
      .send({ doctorId: doctorProfile.id, patientName: 'Consenting Patient', patientPhone: phone, whatsappOptIn: true });
    expect(first.status).toBe(201);
    let patient = await prisma.user.findUniqueOrThrow({ where: { id: first.body.patientId } });
    expect(patient.whatsappOptIn).toBe(true);
    expect(patient.whatsappOptInAt).not.toBeNull();
    expect(patient.whatsappOptInRecordedById).toBe(admin.id);

    await request(app)
      .post('/api/appointments/walk-in')
      .set(auth(adminToken))
      .send({ doctorId: doctorProfile.id, patientName: 'Consenting Patient', patientPhone: phone });
    patient = await prisma.user.findUniqueOrThrow({ where: { id: first.body.patientId } });
    expect(patient.whatsappOptIn).toBe(true);
  });

  it('leaves a walk-in opted out when the box is not ticked', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const res = await request(app)
      .post('/api/appointments/walk-in')
      .set(auth(adminToken))
      .send({ doctorId: doctorProfile.id, patientName: 'No Consent', patientPhone: `97${Math.floor(10000000 + Math.random() * 89999999)}` });
    const patient = await prisma.user.findUniqueOrThrow({ where: { id: res.body.patientId } });
    expect(patient.whatsappOptIn).toBe(false);
    expect(patient.whatsappOptInAt).toBeNull();
  });
});
