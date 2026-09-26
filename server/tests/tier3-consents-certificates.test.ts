import request from 'supertest';
import { app, prisma, setupClinicWithAdmin, createUser, createDoctor, loginAs, auth } from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

const today = () => new Date().toISOString().slice(0, 10);

// A Tier 3 clinic with a patient admitted (₹1,000/day bed, ₹5,000 deposit).
async function admitted(taxPercent = 0) {
  const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 3, taxPercent });
  const { user: patient } = await createUser(clinic.id, 'PATIENT', { name: 'Ramesh Patil' });
  const doctor = await createDoctor(clinic.id);
  const doctorToken = (await loginAs(clinic.slug, doctor.user.email, doctor.password)).token as string;
  const ward = await prisma.ward.create({ data: { clinicId: clinic.id, name: 'General Ward' } });
  const bed = await prisma.bed.create({ data: { wardId: ward.id, label: 'G-1', dailyRate: 1000 } });
  const res = await request(app)
    .post('/api/ipd/admissions')
    .set(auth(adminToken))
    .send({ patientId: patient.id, bedId: bed.id, admittingDoctorId: doctor.doctorProfile.id, depositAmount: 5000 })
    .expect(201);
  return { clinic, adminToken, doctor, doctorToken, patient, admissionId: res.body.id as string };
}

describe('IPD in the patient’s billing', () => {
  it('shows the running bill of a current admission, with its breakdown and the deposit as paid, and folds pharmacy sold during the stay into it', async () => {
    const { adminToken, patient, admissionId, doctorToken } = await admitted();
    await request(app).post(`/api/ipd/admissions/${admissionId}/procedures`).set(auth(doctorToken)).send({ name: 'Dressing', consentSigned: false, fee: 500 }).expect(201);
    await request(app)
      .post('/api/pharmacy/sales')
      .set(auth(adminToken))
      .send({ patientId: patient.id, admissionId, items: [{ medicineName: 'Ceftriaxone 1 g', quantity: 2, unitPrice: 100 }] })
      .expect(201);

    const billing = await request(app).get(`/api/patients/${patient.id}/billing`).set(auth(adminToken));
    expect(billing.status).toBe(200);
    // The stay's pharmacy sale is inside the IPD bill, not a separate bill.
    expect(billing.body.bills.map((b: any) => b.billType)).toEqual(['IPD']);
    const ipd = billing.body.bills[0];
    expect(ipd).toMatchObject({ inProgress: true, total: 1700, amountPaid: 5000, balanceDue: -3300 });
    expect(ipd.label).toContain('General Ward · G-1');
    expect(ipd.breakdown).toEqual([
      { label: 'Room charges', amount: 1000 },
      { label: 'Procedures & surgery', amount: 500 },
      { label: 'Pharmacy', amount: 200 },
      { label: 'Deposit paid at admission', amount: -5000 },
    ]);

    // After discharge: the final bill, and a payment against it counts.
    await request(app).post(`/api/ipd/admissions/${admissionId}/discharge`).set(auth(adminToken)).send({}).expect(200);
    const after = (await request(app).get(`/api/patients/${patient.id}/billing`).set(auth(adminToken))).body.bills[0];
    expect(after).toMatchObject({ inProgress: false, total: 1700, amountPaid: 5000 });
  });

  it('counts an admission once in the revenue report: its final bill, with the deposit as collected', async () => {
    const { adminToken, patient, admissionId } = await admitted();
    await request(app)
      .post('/api/lab/invoices')
      .set(auth(adminToken))
      .send({ patientId: patient.id, admissionId, items: [{ testName: 'CBC', price: 300 }] })
      .expect(201);
    await request(app).post(`/api/ipd/admissions/${admissionId}/discharge`).set(auth(adminToken)).send({}).expect(200);

    const report = await request(app).get(`/api/reports/transactions?from=${today()}&to=${today()}`).set(auth(adminToken));
    expect(report.body.rows.map((r: any) => r.billType)).toEqual(['IPD']);
    expect(report.body.rows[0]).toMatchObject({ billed: 1300, collected: 5000, outstanding: 0, status: 'PAID' });
  });
});

describe('In-house revenue report: OPD vs IPD', () => {
  it('adds each department’s IPD revenue, plus procedures, room and other ward charges, at a Tier 3 clinic', async () => {
    const { adminToken, doctor, doctorToken, patient, admissionId } = await admitted();
    await request(app).post(`/api/ipd/admissions/${admissionId}/doctor-visits`).set(auth(adminToken)).send({ doctorId: doctor.doctorProfile.id, fee: 400 }).expect(201);
    await request(app).post(`/api/ipd/admissions/${admissionId}/procedures`).set(auth(doctorToken)).send({ name: 'Appendectomy', consentSigned: true, fee: 15000 }).expect(201);
    await request(app)
      .post(`/api/ipd/admissions/${admissionId}/medications`)
      .set(auth(adminToken))
      .send({ medicine: 'Ceftriaxone 1 g', dosage: '1 g IV', quantity: 3, unitPrice: 100, source: 'CLINIC_SUPPLIED' })
      .expect(201);
    await request(app).post(`/api/ipd/admissions/${admissionId}/charges`).set(auth(adminToken)).send({ description: 'Nursing', amount: 250 }).expect(201);
    await request(app)
      .post('/api/radiology/invoices')
      .set(auth(adminToken))
      .send({ patientId: patient.id, admissionId, items: [{ testName: 'USG Abdomen', price: 900 }] })
      .expect(201);
    await request(app).post(`/api/ipd/admissions/${admissionId}/discharge`).set(auth(adminToken)).send({}).expect(200);

    const res = await request(app).get(`/api/reports/orders?from=${today()}&to=${today()}`).set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.hasIpd).toBe(true);
    const ipd = Object.fromEntries(res.body.summary.map((c: any) => [c.department, c.ipd]));
    expect(ipd).toEqual({ CONSULTATION: 400, PHARMACY: 300, LAB: 0, RADIOLOGY: 900, PROCEDURE: 15000, ROOM: 1000, OTHER_IPD: 250 });
    // All of it goes to the admitting doctor (who also made the visit).
    expect(res.body.byDoctor).toHaveLength(1);
    expect(res.body.byDoctor[0].cells.reduce((n: number, c: any) => n + c.ipd, 0)).toBe(17850);

    // A Tier 2 clinic has no IPD rows.
    const t2 = await setupClinicWithAdmin({ tier: 2 });
    const r2 = await request(app).get(`/api/reports/orders?from=${today()}&to=${today()}`).set(auth(t2.adminToken));
    expect(r2.body.hasIpd).toBe(false);
    expect(r2.body.departments).toEqual(['CONSULTATION', 'PHARMACY', 'LAB', 'RADIOLOGY']);
  });
});

describe('IPD consent forms', () => {
  it('a doctor writes a surgery consent, it prints with the patient and bed, is marked signed with the guardian and witness, and a procedure is recorded under it', async () => {
    const { clinic, adminToken, doctor, doctorToken, admissionId } = await admitted();
    const created = await request(app)
      .post('/api/consents')
      .set(auth(doctorToken))
      .send({
        admissionId,
        kind: 'SURGERY',
        procedureName: 'Laparoscopic appendectomy',
        doctorId: doctor.doctorProfile.id,
        anaesthesia: 'General',
        risks: 'Bleeding, infection, conversion to open surgery',
      });
    expect(created.status).toBe(201);
    const id = created.body.id;

    // Not signed yet: can't be used for a procedure.
    const early = await request(app)
      .post(`/api/ipd/admissions/${admissionId}/procedures`)
      .set(auth(doctorToken))
      .send({ name: 'Laparoscopic appendectomy', consentSigned: false, consentFormId: id, fee: 20000 });
    expect(early.status).toBe(400);

    const printed = await request(app).get(`/api/consents/${id}`).set(auth(adminToken));
    expect(printed.body).toMatchObject({ procedureName: 'Laparoscopic appendectomy', ward: 'General Ward', bed: 'G-1', patient: { name: 'Ramesh Patil' } });

    // A nurse records the signing.
    const { user: nurse, password } = await createUser(clinic.id, 'NURSE');
    const nurseToken = (await loginAs(clinic.slug, nurse.email, password)).token;
    const signed = await request(app).post(`/api/consents/${id}/sign`).set(auth(nurseToken)).send({ signedByName: 'Sunita Patil', signerRelation: 'Wife', witnessName: 'Nurse Asha' });
    expect(signed.status).toBe(200);
    expect(signed.body.signedAt).toBeTruthy();
    expect((await request(app).post(`/api/consents/${id}/sign`).set(auth(nurseToken)).send({ signedByName: 'X', signerRelation: 'Self' })).status).toBe(409);
    expect((await request(app).delete(`/api/consents/${id}`).set(auth(doctorToken))).status).toBe(409);
    // A nurse can't create or withdraw consent forms.
    expect((await request(app).post('/api/consents').set(auth(nurseToken)).send({})).status).toBe(403);

    const proc = await request(app)
      .post(`/api/ipd/admissions/${admissionId}/procedures`)
      .set(auth(doctorToken))
      .send({ name: 'Laparoscopic appendectomy', consentSigned: false, consentFormId: id, fee: 20000 });
    expect(proc.status).toBe(201);
    expect(proc.body).toMatchObject({ consentSigned: true, consentFormId: id });

    const list = await request(app).get(`/api/consents?admissionId=${admissionId}`).set(auth(nurseToken));
    expect(list.body).toHaveLength(1);

    // The signed scan attaches to it.
    const upload = await request(app)
      .post('/api/attachments')
      .set(auth(nurseToken))
      .field('category', 'CONSENT_FORM')
      .field('entityId', id)
      .attach('file', Buffer.from('%PDF-1.4\n%consent'), { filename: 'consent.pdf', contentType: 'application/pdf' });
    expect(upload.status).toBe(201);
  });

  it('is Tier 3 only', async () => {
    const { adminToken } = await setupClinicWithAdmin({ tier: 2 });
    expect((await request(app).get('/api/consents?admissionId=x').set(auth(adminToken))).status).toBe(403);
  });
});

describe('Medical certificates (every tier)', () => {
  it('a doctor issues a sick-leave certificate that prints on the letterhead; admin issues one for a chosen doctor; others cannot', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const doctor = await createDoctor(clinic.id);
    await prisma.doctorProfile.update({ where: { id: doctor.doctorProfile.id }, data: { qualification: 'MBBS, MD', registrationNumber: 'MMC 12345' } });
    const doctorToken = (await loginAs(clinic.slug, doctor.user.email, doctor.password)).token;
    const { user: patient } = await createUser(clinic.id, 'PATIENT', { name: 'Kiran Joshi' });

    const res = await request(app).post('/api/certificates').set(auth(doctorToken)).send({
      patientId: patient.id,
      type: 'SICK_LEAVE',
      diagnosis: 'Acute viral fever',
      fromDate: '2026-09-24',
      toDate: '2026-09-27',
      body: 'This is to certify that Kiran Joshi was advised rest from 24 Sep 2026 to 27 Sep 2026.',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ type: 'SICK_LEAVE', fromDate: '2026-09-24', toDate: '2026-09-27', doctorId: doctor.doctorProfile.id });
    expect(res.body.certificateNo).toMatch(/^MC-\d{6}-[0-9A-F]{4}$/);

    const printed = await request(app).get(`/api/certificates/${res.body.id}`).set(auth(adminToken));
    expect(printed.body).toMatchObject({ patient: { name: 'Kiran Joshi' }, doctorQualification: 'MBBS, MD', doctorRegistrationNumber: 'MMC 12345' });

    // Dates the wrong way round are refused.
    const bad = await request(app).post('/api/certificates').set(auth(doctorToken)).send({ patientId: patient.id, type: 'SICK_LEAVE', fromDate: '2026-09-27', toDate: '2026-09-24', body: 'x' });
    expect(bad.status).toBe(400);

    // Admin must say which doctor.
    expect((await request(app).post('/api/certificates').set(auth(adminToken)).send({ patientId: patient.id, type: 'MEDICAL_FITNESS', body: 'Fit.' })).status).toBe(400);
    const byAdmin = await request(app).post('/api/certificates').set(auth(adminToken)).send({ patientId: patient.id, type: 'MEDICAL_FITNESS', doctorId: doctor.doctorProfile.id, body: 'Fit.' });
    expect(byAdmin.status).toBe(201);

    const list = await request(app).get(`/api/certificates?patientId=${patient.id}`).set(auth(doctorToken));
    expect(list.body.map((c: any) => c.type)).toEqual(['MEDICAL_FITNESS', 'SICK_LEAVE']);

    const { user: desk, password } = await createUser(clinic.id, 'RECEPTIONIST');
    const deskToken = (await loginAs(clinic.slug, desk.email, password)).token;
    expect((await request(app).get(`/api/certificates?patientId=${patient.id}`).set(auth(deskToken))).status).toBe(403);
  });
});
