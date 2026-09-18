import request from 'supertest';
import { app, prisma, setupClinicWithAdmin, createUser, createDoctor, loginAs, auth, tomorrowDateStr } from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Consultation fee: own-recorded-charge invariant', () => {
  it('snapshots the fee at booking time and freezes it against later doctor fee changes', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id, { consultationFee: 500 });
    const { user: patient, password } = await createUser(clinic.id, 'PATIENT');
    const patientSession = await loginAs(clinic.slug, patient.email, password);

    const appt = await request(app)
      .post('/api/appointments')
      .set(auth(patientSession.token))
      .send({ doctorId: doctorProfile.id, date: tomorrowDateStr(), startTime: '09:00' });
    expect(appt.status).toBe(201);
    expect(appt.body.consultationFee).toBe(500);

    // Doctor's fee changes afterward -- the already-booked appointment must not move.
    await request(app).put(`/api/admin/doctors/${doctorProfile.id}`).set(auth(adminToken)).send({ consultationFee: 900 });

    const refetched = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.body.id } });
    expect(refetched.consultationFee).toBe(500);
  });

  it('a walk-in also snapshots the doctor\'s current fee', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id, { consultationFee: 300 });

    const walkIn = await request(app)
      .post('/api/appointments/walk-in')
      .set(auth(adminToken))
      .send({ doctorId: doctorProfile.id, patientName: 'Walk-in Patient', patientPhone: '9123456780' });
    expect(walkIn.status).toBe(201);
    expect(walkIn.body.consultationFee).toBe(300);
  });
});

describe('Payments: recording and balance tracking', () => {
  it('records a full payment against a consultation and reaches a zero balance', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id, { consultationFee: 500 });
    const walkIn = await request(app)
      .post('/api/appointments/walk-in')
      .set(auth(adminToken))
      .send({ doctorId: doctorProfile.id, patientName: 'Fee Payer', patientPhone: '9123456781' });
    const appointmentId = walkIn.body.id;

    const payment = await request(app)
      .post('/api/payments')
      .set(auth(adminToken))
      .send({ billType: 'CONSULTATION', billId: appointmentId, amount: 500, method: 'CASH' });
    expect(payment.status).toBe(201);
    expect(payment.body.amountPaid).toBe(500);
    expect(payment.body.balanceDue).toBe(0);

    const status = await request(app)
      .get('/api/payments')
      .query({ billType: 'CONSULTATION', billId: appointmentId })
      .set(auth(adminToken));
    expect(status.body.payments).toHaveLength(1);
    expect(status.body.payments[0].method).toBe('CASH');
  });

  it('accumulates two partial payments correctly and rejects an amount exceeding the remaining balance', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 2, taxPercent: 0 });
    const { user: patient } = await createUser(clinic.id, 'PATIENT');
    const item = await prisma.pharmacyItem.create({
      data: { clinicId: clinic.id, name: 'Amoxicillin', pricePerUnit: 10, costPricePerUnit: 6, stockUnits: 100 },
    });
    const sale = await request(app)
      .post('/api/pharmacy/sales')
      .set(auth(adminToken))
      .send({ patientId: patient.id, items: [{ itemId: item.id, medicineName: item.name, quantity: 10, unitPrice: 10 }] });
    expect(sale.body.total).toBe(100);

    const first = await request(app)
      .post('/api/payments')
      .set(auth(adminToken))
      .send({ billType: 'PHARMACY', billId: sale.body.id, amount: 60, method: 'CASH' });
    expect(first.body.balanceDue).toBe(40);

    const overpay = await request(app)
      .post('/api/payments')
      .set(auth(adminToken))
      .send({ billType: 'PHARMACY', billId: sale.body.id, amount: 50, method: 'CARD' });
    expect(overpay.status).toBe(400);

    const second = await request(app)
      .post('/api/payments')
      .set(auth(adminToken))
      .send({ billType: 'PHARMACY', billId: sale.body.id, amount: 40, method: 'UPI' });
    expect(second.body.amountPaid).toBe(100);
    expect(second.body.balanceDue).toBe(0);
  });

  it('rejects recording a payment against an IPD admission before it has been discharged', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 3 });
    const { user: patient } = await createUser(clinic.id, 'PATIENT');
    const { doctorProfile } = await createDoctor(clinic.id);
    const ward = await prisma.ward.create({ data: { clinicId: clinic.id, name: 'General' } });
    const bed = await prisma.bed.create({ data: { wardId: ward.id, label: 'G-1', dailyRate: 1000 } });
    const admission = await request(app)
      .post('/api/ipd/admissions')
      .set(auth(adminToken))
      .send({ patientId: patient.id, bedId: bed.id, admittingDoctorId: doctorProfile.id });

    const attempt = await request(app)
      .post('/api/payments')
      .set(auth(adminToken))
      .send({ billType: 'IPD', billId: admission.body.id, amount: 100, method: 'CASH' });
    expect(attempt.status).toBe(400);
  });

  it('allows recording a payment against a discharged IPD admission\'s final bill', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 3, taxPercent: 0 });
    const { user: patient } = await createUser(clinic.id, 'PATIENT');
    const { doctorProfile } = await createDoctor(clinic.id);
    const ward = await prisma.ward.create({ data: { clinicId: clinic.id, name: 'General' } });
    const bed = await prisma.bed.create({ data: { wardId: ward.id, label: 'G-1', dailyRate: 1000 } });
    const admission = await request(app)
      .post('/api/ipd/admissions')
      .set(auth(adminToken))
      .send({ patientId: patient.id, bedId: bed.id, admittingDoctorId: doctorProfile.id });
    const discharge = await request(app)
      .post(`/api/ipd/admissions/${admission.body.id}/discharge`)
      .set(auth(adminToken))
      .send({});
    const total = discharge.body.bill.total;

    const payment = await request(app)
      .post('/api/payments')
      .set(auth(adminToken))
      .send({ billType: 'IPD', billId: admission.body.id, amount: total, method: 'CARD' });
    expect(payment.status).toBe(201);
    expect(payment.body.balanceDue).toBe(0);
  });

  it('IPD payable amount nets out the deposit already collected -- an overpaid deposit is payable ₹0, not the raw bill total', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 3, taxPercent: 0 });
    const { user: patient } = await createUser(clinic.id, 'PATIENT');
    const { doctorProfile } = await createDoctor(clinic.id);
    const ward = await prisma.ward.create({ data: { clinicId: clinic.id, name: 'General' } });
    const bed = await prisma.bed.create({ data: { wardId: ward.id, label: 'G-1', dailyRate: 1000 } });
    const admission = await request(app)
      .post('/api/ipd/admissions')
      .set(auth(adminToken))
      .send({ patientId: patient.id, bedId: bed.id, admittingDoctorId: doctorProfile.id, depositAmount: 20000 });
    const discharge = await request(app)
      .post(`/api/ipd/admissions/${admission.body.id}/discharge`)
      .set(auth(adminToken))
      .send({});
    expect(discharge.body.bill.amountDue).toBeLessThan(0); // refund owed, deposit exceeded the bill

    const status = await request(app)
      .get('/api/payments')
      .query({ billType: 'IPD', billId: admission.body.id })
      .set(auth(adminToken));
    expect(status.body.total).toBe(0); // nothing left to collect through this ledger
    expect(status.body.balanceDue).toBe(0);

    // Attempting to record a payment anyway should be rejected -- there's no
    // outstanding balance to pay against.
    const attempt = await request(app)
      .post('/api/payments')
      .set(auth(adminToken))
      .send({ billType: 'IPD', billId: admission.body.id, amount: 100, method: 'CASH' });
    expect(attempt.status).toBe(400);
  });

  it('IPD payable amount is the positive remainder after a partial deposit, not the full bill total', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 3, taxPercent: 0 });
    const { user: patient } = await createUser(clinic.id, 'PATIENT');
    const { doctorProfile } = await createDoctor(clinic.id);
    const ward = await prisma.ward.create({ data: { clinicId: clinic.id, name: 'General' } });
    const bed = await prisma.bed.create({ data: { wardId: ward.id, label: 'G-1', dailyRate: 1000 } });
    const admission = await request(app)
      .post('/api/ipd/admissions')
      .set(auth(adminToken))
      .send({ patientId: patient.id, bedId: bed.id, admittingDoctorId: doctorProfile.id, depositAmount: 400 });
    const discharge = await request(app)
      .post(`/api/ipd/admissions/${admission.body.id}/discharge`)
      .set(auth(adminToken))
      .send({});
    const { total, amountDue } = discharge.body.bill;
    expect(amountDue).toBe(total - 400);

    const status = await request(app)
      .get('/api/payments')
      .query({ billType: 'IPD', billId: admission.body.id })
      .set(auth(adminToken));
    expect(status.body.total).toBe(amountDue); // payable = amountDue, not the raw bill total
  });
});

describe('Payments: role gating mirrors each bill type\'s own access', () => {
  it('a Pharmacist cannot record a Lab or IPD payment, and a Lab Tech cannot record a Pharmacy payment', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 2, taxPercent: 0 });
    const { user: patient } = await createUser(clinic.id, 'PATIENT');

    const pharmacistEmail = 'pharmacist-role@test.local';
    await createUser(clinic.id, 'PHARMACIST', { email: pharmacistEmail, password: 'password123' });
    const pharmacistSession = await loginAs(clinic.slug, pharmacistEmail, 'password123');

    const labTechEmail = 'labtech-role@test.local';
    await createUser(clinic.id, 'LAB_TECHNICIAN', { email: labTechEmail, password: 'password123' });
    const labTechSession = await loginAs(clinic.slug, labTechEmail, 'password123');

    const invoice = await prisma.labInvoice.create({
      data: { clinicId: clinic.id, patientId: patient.id, recordedById: patient.id, taxPercent: 0, subtotal: 100, taxAmount: 0, total: 100 },
    });

    expect(
      (
        await request(app)
          .post('/api/payments')
          .set(auth(pharmacistSession.token))
          .send({ billType: 'LAB', billId: invoice.id, amount: 100, method: 'CASH' })
      ).status,
    ).toBe(403);

    const sale = await prisma.pharmacySale.create({
      data: { clinicId: clinic.id, patientId: patient.id, soldById: patient.id, taxPercent: 0, subtotal: 50, taxAmount: 0, total: 50 },
    });
    expect(
      (
        await request(app)
          .post('/api/payments')
          .set(auth(labTechSession.token))
          .send({ billType: 'PHARMACY', billId: sale.id, amount: 50, method: 'CASH' })
      ).status,
    ).toBe(403);
  });

  it("a patient can view their own bill's payment status but not another patient's", async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id, { consultationFee: 200 });
    const { user: patientA, password: passwordA } = await createUser(clinic.id, 'PATIENT', { email: 'patient-a@test.local' });
    const { user: patientB, password: passwordB } = await createUser(clinic.id, 'PATIENT', { email: 'patient-b@test.local' });
    const sessionA = await loginAs(clinic.slug, patientA.email, passwordA);
    const sessionB = await loginAs(clinic.slug, patientB.email, passwordB);

    const apptA = await request(app)
      .post('/api/appointments')
      .set(auth(sessionA.token))
      .send({ doctorId: doctorProfile.id, date: tomorrowDateStr(), startTime: '09:00' });

    const ownView = await request(app)
      .get('/api/payments')
      .query({ billType: 'CONSULTATION', billId: apptA.body.id })
      .set(auth(sessionA.token));
    expect(ownView.status).toBe(200);
    expect(ownView.body.total).toBe(200);

    const otherView = await request(app)
      .get('/api/payments')
      .query({ billType: 'CONSULTATION', billId: apptA.body.id })
      .set(auth(sessionB.token));
    expect(otherView.status).toBe(403);
  });
});
