import request from 'supertest';
import { app, prisma, setupClinicWithAdmin, createUser, createDoctor, loginAs, uniqueEmail, auth } from './helpers';
import { createSummaryToken, verifySummaryToken } from '../src/utils/visitSummary';

afterAll(async () => {
  await prisma.$disconnect();
});

async function login(clinicSlug: string, email: string) {
  return (await loginAs(clinicSlug, email, 'password123')).token;
}

// A clinic with an admin, a doctor (fee 500) and a registered patient who
// has agreed to WhatsApp, plus a visit started by the doctor.
async function setup(tier: 1 | 2 | 3 = 1) {
  const { clinic, adminToken } = await setupClinicWithAdmin({ tier });
  const doctorEmail = uniqueEmail('doc');
  const { doctorProfile } = await createDoctor(clinic.id, { email: doctorEmail, consultationFee: 500 });
  const doctorToken = await login(clinic.slug, doctorEmail);
  const patientEmail = uniqueEmail('pat');
  const reg = await request(app)
    .post('/api/patients')
    .set(auth(adminToken))
    .send({ firstName: 'Ravi', lastName: 'Kumar', phone: '9811122233', email: patientEmail, gender: 'MALE', ageYears: 40, whatsappOptIn: true });
  await prisma.user.update({ where: { id: reg.body.id }, data: { password: (await prisma.user.findFirstOrThrow({ where: { clinicId: clinic.id, role: 'DOCTOR' } })).password } });
  const patientToken = await login(clinic.slug, patientEmail);
  const visit = await request(app).post('/api/appointments/visit').set(auth(doctorToken)).send({ patientId: reg.body.id });
  return { clinic, adminToken, doctorToken, doctorProfile, patientToken, patientId: reg.body.id as string, visitId: visit.body.id as string, visit };
}

const fullConsultation = {
  vitals: { tempF: 99.4, pulse: 88, bpSystolic: 120, bpDiastolic: 80, respiratoryRate: 18, spo2: 98, heightCm: 160, weightKg: 64, bloodSugar: 110, bloodSugarType: 'FASTING' },
  chiefComplaint: 'Fever for 3 days',
  presentIllness: 'Evening rise of temperature',
  relevantHistory: 'Diabetic',
  diagnosis: 'Viral fever',
  differentialDiagnosis: 'Dengue',
  notes: 'Plenty of fluids',
  imagingAdvice: 'USG abdomen if pain persists',
  doctorNotes: 'Check sugar control next visit',
  followUpDate: '2030-01-10',
  prescriptions: [
    { medicine: 'Paracetamol', strength: '500 mg', morning: true, night: true, foodTiming: 'AFTER_FOOD', durationDays: 5, notes: 'If fever > 100°F' },
    { medicine: 'ORS', frequency: 'SOS', durationDays: 3 },
  ],
  labTestsOrdered: [{ testName: 'CBC', notes: 'Fasting' }],
  radiologyOrdered: [{ testName: 'Chest X-Ray' }],
};

describe('Starting a visit from the profile', () => {
  it('lets a doctor start their own visit today, in consultation, with their fee', async () => {
    const { visit, doctorProfile } = await setup();
    expect(visit.status).toBe(201);
    expect(visit.body).toMatchObject({ status: 'IN_CONSULTATION', doctorId: doctorProfile.id, consultationFee: 500, tokenNumber: 1 });
  });

  it('needs admin to pick the doctor, and is not for the front desk', async () => {
    const { clinic, adminToken, patientId, doctorProfile } = await setup();
    expect((await request(app).post('/api/appointments/visit').set(auth(adminToken)).send({ patientId })).status).toBe(400);
    const ok = await request(app).post('/api/appointments/visit').set(auth(adminToken)).send({ patientId, doctorId: doctorProfile.id });
    expect(ok.status).toBe(201);
    const email = uniqueEmail('rec');
    await createUser(clinic.id, 'RECEPTIONIST', { email });
    const rec = await login(clinic.slug, email);
    expect((await request(app).post('/api/appointments/visit').set(auth(rec)).send({ patientId, doctorId: doctorProfile.id })).status).toBe(403);
  });
});

describe('Recording a consultation', () => {
  it('saves the clinical notes, °F vitals, tick-box prescriptions and orders (Tier 1 too)', async () => {
    const { doctorToken, visitId } = await setup(1);
    const res = await request(app).put(`/api/consultations/${visitId}`).set(auth(doctorToken)).send(fullConsultation);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      chiefComplaint: 'Fever for 3 days',
      differentialDiagnosis: 'Dengue',
      imagingAdvice: 'USG abdomen if pain persists',
      doctorNotes: 'Check sugar control next visit',
      vitals: { tempF: 99.4, respiratoryRate: 18, bloodSugar: 110, bloodSugarType: 'FASTING' },
    });
    const para = res.body.prescriptions.find((p: any) => p.medicine === 'Paracetamol');
    expect(para).toMatchObject({ strength: '500 mg', morning: true, afternoon: false, night: true, frequency: '1-0-1', dosage: '1', foodTiming: 'AFTER_FOOD', totalToDispense: 10 });
    const ors = res.body.prescriptions.find((p: any) => p.medicine === 'ORS');
    expect(ors).toMatchObject({ frequency: 'SOS', totalToDispense: null });
    expect(res.body.labTestsOrdered[0].testName).toBe('CBC');
    expect(res.body.radiologyOrdered[0].testName).toBe('Chest X-Ray');
  });

  it('needs a time of day or a frequency on each medicine', async () => {
    const { doctorToken, visitId } = await setup();
    const res = await request(app)
      .put(`/api/consultations/${visitId}`)
      .set(auth(doctorToken))
      .send({ prescriptions: [{ medicine: 'Paracetamol', durationDays: 3 }] });
    expect(res.status).toBe(400);
  });

  it('lets the fee change per visit, but not below what has been paid', async () => {
    const { adminToken, doctorToken, visitId } = await setup();
    await request(app).post('/api/payments').set(auth(adminToken)).send({ billType: 'CONSULTATION', billId: visitId, amount: 300, method: 'CASH' });
    const tooLow = await request(app).put(`/api/consultations/${visitId}`).set(auth(doctorToken)).send({ consultationFee: 200 });
    expect(tooLow.status).toBe(400);
    const ok = await request(app).put(`/api/consultations/${visitId}`).set(auth(doctorToken)).send({ consultationFee: 300 });
    expect(ok.status).toBe(200);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: visitId } })).consultationFee).toBe(300);
  });

  it('keeps a completed visit completed when it is edited later, and resets reminders when the follow-up moves', async () => {
    const { doctorToken, visitId } = await setup();
    await request(app).put(`/api/consultations/${visitId}`).set(auth(doctorToken)).send({ ...fullConsultation, complete: true });
    await prisma.consultation.update({ where: { appointmentId: visitId }, data: { followUpReminderSentAt: new Date() } });
    await request(app).put(`/api/consultations/${visitId}`).set(auth(doctorToken)).send({ diagnosis: 'Viral fever (resolved)' });
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: visitId } })).status).toBe('COMPLETED');
    let row = await prisma.consultation.findUniqueOrThrow({ where: { appointmentId: visitId } });
    expect(row.followUpReminderSentAt).not.toBeNull(); // follow-up not touched

    await request(app).put(`/api/consultations/${visitId}`).set(auth(doctorToken)).send({ followUpDate: '2030-02-01' });
    row = await prisma.consultation.findUniqueOrThrow({ where: { appointmentId: visitId } });
    expect(row.followUpReminderSentAt).toBeNull();
    expect(row.followUpDate!.toISOString().slice(0, 10)).toBe('2030-02-01');

    await request(app).put(`/api/consultations/${visitId}`).set(auth(doctorToken)).send({ followUpDate: '' });
    row = await prisma.consultation.findUniqueOrThrow({ where: { appointmentId: visitId } });
    expect(row.followUpDate).toBeNull();
  });

  it("never shows the doctor's private notes to the patient", async () => {
    const { doctorToken, patientToken, patientId, visitId } = await setup();
    await request(app).put(`/api/consultations/${visitId}`).set(auth(doctorToken)).send(fullConsultation);

    const own = await request(app).get(`/api/consultations/${visitId}`).set(auth(patientToken));
    expect(own.status).toBe(200);
    expect(own.body.diagnosis).toBe('Viral fever');
    expect(own.body.doctorNotes).toBeNull();
    const records = await request(app).get(`/api/patients/${patientId}/records`).set(auth(patientToken));
    expect(JSON.stringify(records.body)).not.toContain('Check sugar control');
    const appt = await request(app).get(`/api/appointments/${visitId}`).set(auth(patientToken));
    expect(JSON.stringify(appt.body)).not.toContain('Check sugar control');

    const doctorView = await request(app).get(`/api/consultations/${visitId}`).set(auth(doctorToken));
    expect(doctorView.body.doctorNotes).toBe('Check sugar control next visit');
  });
});

describe('Visit summary', () => {
  it('has what the patient printout shows, and nothing private', async () => {
    const { doctorToken, visitId } = await setup();
    await request(app).put(`/api/consultations/${visitId}`).set(auth(doctorToken)).send(fullConsultation);
    const res = await request(app).get(`/api/consultations/${visitId}/summary`).set(auth(doctorToken));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      visitNumber: 1,
      patient: { name: 'Ravi Kumar', patientCode: 'PT000001', age: 40, gender: 'MALE' },
      symptoms: ['Fever for 3 days', 'Evening rise of temperature'],
      diagnosis: 'Viral fever',
      advice: 'Plenty of fluids',
      followUpDate: '2030-01-10',
    });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('Dengue'); // differential diagnosis
    expect(text).not.toContain('Check sugar control'); // private notes
    expect(text).not.toContain('Diabetic'); // relevant history
  });

  it('numbers visits per patient', async () => {
    const { doctorToken, patientId, visitId } = await setup();
    await request(app).put(`/api/consultations/${visitId}`).set(auth(doctorToken)).send({ diagnosis: 'First', complete: true });
    const second = await request(app).post('/api/appointments/visit').set(auth(doctorToken)).send({ patientId });
    await request(app).put(`/api/consultations/${second.body.id}`).set(auth(doctorToken)).send({ diagnosis: 'Second' });
    const res = await request(app).get(`/api/consultations/${second.body.id}/summary`).set(auth(doctorToken));
    expect(res.body.visitNumber).toBe(2);
  });

  it('renders as a PDF for staff and the patient, not the front desk', async () => {
    const { clinic, doctorToken, patientToken, visitId } = await setup();
    await request(app).put(`/api/consultations/${visitId}`).set(auth(doctorToken)).send(fullConsultation);
    const pdf = await request(app).get(`/api/consultations/${visitId}/summary.pdf`).set(auth(patientToken)).buffer(true);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');

    const email = uniqueEmail('rec');
    await createUser(clinic.id, 'RECEPTIONIST', { email });
    const rec = await login(clinic.slug, email);
    expect((await request(app).get(`/api/consultations/${visitId}/summary`).set(auth(rec))).status).toBe(403);
  });

  it('is sent on WhatsApp as a signed PDF link that opens without a login', async () => {
    const { doctorToken, visitId, patientId } = await setup();
    await request(app).put(`/api/consultations/${visitId}`).set(auth(doctorToken)).send(fullConsultation);
    const sent = await request(app).post(`/api/consultations/${visitId}/send-summary-whatsapp`).set(auth(doctorToken));
    expect(sent.status).toBe(200);
    expect(sent.body).toMatchObject({ status: 'SENT', type: 'VISIT_SUMMARY_SHARED', channel: 'WHATSAPP' });
    expect(await prisma.notification.count({ where: { patientId, type: 'VISIT_SUMMARY_SHARED' } })).toBe(1);

    const token = createSummaryToken(visitId);
    const open = await request(app).get(`/api/public/visit-summary/${token}`).buffer(true);
    expect(open.status).toBe(200);
    expect(open.body.subarray(0, 4).toString()).toBe('%PDF');

    expect((await request(app).get(`/api/public/visit-summary/${token.slice(0, -2)}xx`)).status).toBe(404);
    const expired = createSummaryToken(visitId, Date.now() - 31 * 24 * 3600 * 1000);
    expect(verifySummaryToken(expired)).toBeNull();
    expect((await request(app).get(`/api/public/visit-summary/${expired}`)).status).toBe(404);
  });
});

describe("Doctor's Catalogue", () => {
  it('lets a Tier 1 doctor keep medicine/lab/radiology lists that the consultation suggests', async () => {
    const { doctorToken } = await setup(1);
    const add = (body: object) => request(app).post('/api/catalogue').set(auth(doctorToken)).send(body);
    expect((await add({ kind: 'MEDICINE', name: 'Paracetamol', strength: '250 mg' })).status).toBe(201);
    expect((await add({ kind: 'MEDICINE', name: 'Paracetamol', strength: '500 mg' })).status).toBe(201);
    expect((await add({ kind: 'MEDICINE', name: 'paracetamol', strength: '500 MG' })).status).toBe(409);
    expect((await add({ kind: 'LAB_TEST', name: 'CBC' })).status).toBe(201);
    const xray = await add({ kind: 'RADIOLOGY', name: 'X-Ray', strength: 'ignored' });
    expect(xray.body.strength).toBeNull();

    const s = await request(app).get('/api/catalogue/suggestions').set(auth(doctorToken));
    expect(s.body.medicines).toEqual([
      { name: 'Paracetamol', strength: '250 mg', brands: [] },
      { name: 'Paracetamol', strength: '500 mg', brands: [] },
    ]);
    expect(s.body.labTests).toEqual(['CBC']);
    expect(s.body.radiology).toEqual(['X-Ray']);
    // The standard list backs them up with only what the clinic doesn't have.
    expect(s.body.standard.labTests).not.toContain('CBC');
    expect(s.body.standard.medicines.some((m: { name: string; strength: string }) => m.name === 'Paracetamol' && m.strength === '500 mg')).toBe(false);
    expect(s.body.standard.medicines.some((m: { name: string; strength: string }) => m.name === 'Paracetamol' && m.strength === '650 mg')).toBe(true);

    const edited = await request(app).put(`/api/catalogue/${xray.body.id}`).set(auth(doctorToken)).send({ name: 'Chest X-Ray' });
    expect(edited.body.name).toBe('Chest X-Ray');
    expect((await request(app).delete(`/api/catalogue/${xray.body.id}`).set(auth(doctorToken))).status).toBe(204);
  });

  it('keeps several brands per medicine, offers them with the suggestion, and saves the chosen brand on the prescription', async () => {
    const { doctorToken, visitId } = await setup(1);
    const add = await request(app)
      .post('/api/catalogue')
      .set(auth(doctorToken))
      .send({ kind: 'MEDICINE', name: 'Paracetamol', strength: '650 mg', brands: ['Dolo 650', ' Calpol 650 ', 'dolo 650', ''] });
    expect(add.body.brands).toEqual(['Dolo 650', 'Calpol 650']);
    const edited = await request(app).put(`/api/catalogue/${add.body.id}`).set(auth(doctorToken)).send({ name: 'Paracetamol', strength: '650 mg', brands: ['Dolo 650', 'Calpol 650', 'Crocin 650'] });
    expect(edited.body.brands).toEqual(['Dolo 650', 'Calpol 650', 'Crocin 650']);
    const s = await request(app).get('/api/catalogue/suggestions').set(auth(doctorToken));
    expect(s.body.medicines).toContainEqual({ name: 'Paracetamol', strength: '650 mg', brands: ['Dolo 650', 'Calpol 650', 'Crocin 650'] });

    const saved = await request(app)
      .put(`/api/consultations/${visitId}`)
      .set(auth(doctorToken))
      .send({ prescriptions: [{ medicine: 'Paracetamol', strength: '650 mg', brand: 'Dolo 650', morning: true, durationDays: 3 }] });
    expect(saved.body.prescriptions[0]).toMatchObject({ medicine: 'Paracetamol', brand: 'Dolo 650' });
    const summary = await request(app).get(`/api/consultations/${visitId}/summary`).set(auth(doctorToken));
    expect(summary.body.prescriptions[0].brand).toBe('Dolo 650');
  });

  it('backs up empty lists with the standard list, so "C" offers CBC and "X" the X-rays', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 2 });
    void clinic;
    const s = await request(app).get('/api/catalogue/suggestions').set(auth(adminToken));
    expect(s.body.labTests).toEqual([]);
    expect(s.body.standard.labTests.some((n: string) => /^CBC/.test(n))).toBe(true);
    expect(s.body.standard.radiology.filter((n: string) => /^X-Ray/i.test(n)).length).toBeGreaterThan(3);
    expect(s.body.standard.medicines.some((m: { name: string }) => m.name === 'Paracetamol')).toBe(true);
  });

  it('adds the starter list once, skipping what is already there', async () => {
    const { adminToken } = await setup();
    await request(app).post('/api/catalogue').set(auth(adminToken)).send({ kind: 'LAB_TEST', name: 'cbc' });
    // A medicine the clinic already has gets the starter's brands merged in.
    await request(app).post('/api/catalogue').set(auth(adminToken)).send({ kind: 'MEDICINE', name: 'paracetamol', strength: '650 MG', brands: ['My brand'] });
    const first = await request(app).post('/api/catalogue/starter').set(auth(adminToken));
    expect(first.body.added).toBeGreaterThan(500);
    expect(first.body.brandsAdded).toBeGreaterThan(0);
    const meds = await request(app).get('/api/catalogue').query({ kind: 'MEDICINE' }).set(auth(adminToken));
    const para = meds.body.filter((i: any) => i.name.toLowerCase() === 'paracetamol' && i.strength?.toLowerCase() === '650 mg');
    expect(para).toHaveLength(1);
    expect(para[0].brands).toEqual(expect.arrayContaining(['My brand', 'Dolo 650']));
    const again = await request(app).post('/api/catalogue/starter').set(auth(adminToken));
    expect(again.body.added).toBe(0);
    const labs = await request(app).get('/api/catalogue').query({ kind: 'LAB_TEST' }).set(auth(adminToken));
    expect(labs.body.filter((i: any) => i.name.toLowerCase() === 'cbc')).toHaveLength(1);
  });

  it('also suggests the Tier 2 department catalogues, and only doctors/admin edit it', async () => {
    const { clinic, adminToken, doctorToken } = await setup(2);
    await prisma.pharmacyItem.create({ data: { clinicId: clinic.id, name: 'Azithromycin 500', pricePerUnit: 10, costPricePerUnit: 5 } });
    await prisma.labTestCatalog.create({ data: { clinicId: clinic.id, name: 'Lipid Profile', price: 500 } });
    await request(app).post('/api/catalogue').set(auth(adminToken)).send({ kind: 'LAB_TEST', name: 'lipid profile' });
    const s = await request(app).get('/api/catalogue/suggestions').set(auth(doctorToken));
    expect(s.body.medicines).toContainEqual({ name: 'Azithromycin 500', strength: null, brands: [] });
    expect(s.body.labTests.filter((n: string) => n.toLowerCase() === 'lipid profile')).toHaveLength(1);

    const email = uniqueEmail('ph');
    await createUser(clinic.id, 'PHARMACIST', { email });
    const ph = await login(clinic.slug, email);
    expect((await request(app).post('/api/catalogue').set(auth(ph)).send({ kind: 'LAB_TEST', name: 'X' })).status).toBe(403);
  });
});

describe('Letterhead details', () => {
  it('admin sets the clinic address/phone and the doctor qualification/registration, and they print', async () => {
    const { adminToken, doctorToken, doctorProfile, visitId } = await setup();
    const clinic = await request(app).put('/api/clinics/me/current').set(auth(adminToken)).send({ address: '12 MG Road, Pune', phone: '020-1234567' });
    expect(clinic.body).toMatchObject({ address: '12 MG Road, Pune', phone: '020-1234567' });
    const doc = await request(app)
      .put(`/api/admin/doctors/${doctorProfile.id}`)
      .set(auth(adminToken))
      .send({ qualification: 'MBBS, MD', registrationNumber: 'MMC 12345' });
    expect(doc.body).toMatchObject({ qualification: 'MBBS, MD', registrationNumber: 'MMC 12345' });

    await request(app).put(`/api/consultations/${visitId}`).set(auth(doctorToken)).send({ diagnosis: 'Viral fever' });
    const s = await request(app).get(`/api/consultations/${visitId}/summary`).set(auth(doctorToken));
    expect(s.body.clinic).toMatchObject({ address: '12 MG Road, Pune', phone: '020-1234567' });
    expect(s.body.doctor).toMatchObject({ qualification: 'MBBS, MD', registrationNumber: 'MMC 12345' });

    expect((await request(app).put('/api/clinics/me/current').set(auth(doctorToken)).send({ phone: '1' })).status).toBe(403);
  });
});
