import request from 'supertest';
import { app, prisma, setupClinicWithAdmin, createUser, createDoctor, loginAs, auth } from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

const day = new Date().toISOString().slice(0, 10);
const range = `from=${day}&to=${day}`;

async function staff(clinic: { id: string; slug: string }, role: 'PHARMACIST' | 'LAB_TECHNICIAN' | 'RADIOLOGY_TECHNICIAN') {
  const { user, password } = await createUser(clinic.id, role);
  return (await loginAs(clinic.slug, user.email, password)).token as string;
}

// A Tier 2 clinic where a doctor's patient bought 10 Dolo 650 (cost 1.20,
// price 2), had a CBC (cost 100, price 300) and a chest X-ray (cost 200,
// price 500) done in-house; plus a sale over the counter to another patient.
async function clinicWithSales() {
  const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 2, taxPercent: 0 });
  const doctor = await createDoctor(clinic.id, { name: 'Asha Rao' });
  const doctorToken = (await loginAs(clinic.slug, doctor.user.email, doctor.password)).token as string;
  const other = await createDoctor(clinic.id, { name: 'Vikram Shah' });
  const { user: patient } = await createUser(clinic.id, 'PATIENT', { name: 'Meera Joshi' });
  const appointment = await prisma.appointment.create({
    data: { clinicId: clinic.id, patientId: patient.id, doctorId: doctor.doctorProfile.id, date: new Date(`${day}T00:00:00Z`), tokenNumber: 1, status: 'COMPLETED' },
  });
  const consultation = await prisma.consultation.create({
    data: {
      appointmentId: appointment.id,
      prescriptions: { create: [{ medicine: 'Paracetamol', strength: '650 mg', brand: 'Dolo 650', dosage: '1 tab', frequency: '1-0-1', durationDays: 5 }] },
      labTestsOrdered: { create: [{ testName: 'CBC' }] },
      radiologyOrdered: { create: [{ testName: 'Chest X-Ray PA' }] },
    },
    include: { prescriptions: true, labTestsOrdered: true, radiologyOrdered: true },
  });

  const pharmacist = await staff(clinic, 'PHARMACIST');
  const labTech = await staff(clinic, 'LAB_TECHNICIAN');
  const radTech = await staff(clinic, 'RADIOLOGY_TECHNICIAN');
  const dolo = await prisma.pharmacyItem.create({
    data: { clinicId: clinic.id, name: 'Paracetamol', strength: '650 mg', brand: 'Dolo 650', pricePerUnit: 2, costPricePerUnit: 1.2, stockUnits: 100 },
  });
  const sale = await request(app)
    .post('/api/pharmacy/sales')
    .set(auth(pharmacist))
    .send({ patientId: patient.id, items: [{ prescriptionId: consultation.prescriptions[0]!.id, itemId: dolo.id, medicineName: 'Dolo 650', quantity: 10, unitPrice: 2 }] });
  expect(sale.status).toBe(201);
  expect(sale.body.items[0].unitCost).toBe(1.2);

  const cbc = await request(app).post('/api/lab/catalog').set(auth(labTech)).send({ name: 'CBC', price: 300, cost: 100 });
  expect(cbc.body.cost).toBe(100);
  const labInv = await request(app)
    .post('/api/lab/invoices')
    .set(auth(labTech))
    .send({ patientId: patient.id, items: [{ orderId: consultation.labTestsOrdered[0]!.id, catalogItemId: cbc.body.id, testName: 'CBC', price: 300 }] });
  expect(labInv.status).toBe(201);
  const xray = await request(app).post('/api/radiology/catalog').set(auth(radTech)).send({ name: 'Chest X-Ray PA', price: 500, cost: 200 });
  const radInv = await request(app)
    .post('/api/radiology/invoices')
    .set(auth(radTech))
    .send({ patientId: patient.id, items: [{ orderId: consultation.radiologyOrdered[0]!.id, catalogItemId: xray.body.id, testName: 'Chest X-Ray PA', price: 500 }] });
  expect(radInv.status).toBe(201);

  // Over the counter: no prescription, no visit.
  const { user: walkIn } = await createUser(clinic.id, 'PATIENT', { name: 'Walk In' });
  const otc = await request(app)
    .post('/api/pharmacy/sales')
    .set(auth(pharmacist))
    .send({ patientId: walkIn.id, items: [{ itemId: dolo.id, medicineName: 'Dolo 650', quantity: 5, unitPrice: 2 }] });
  expect(otc.status).toBe(201);

  return { clinic, adminToken, doctor, doctorToken, other, pharmacist, labTech };
}

describe('Department reports', () => {
  it('lists what the pharmacy sold with cost, revenue and profit, by day and by item', async () => {
    const { adminToken, pharmacist } = await clinicWithSales();
    const res = await request(app).get(`/api/reports/department?department=PHARMACY&${range}`).set(auth(pharmacist));
    expect(res.status).toBe(200);
    expect(res.body.totals).toEqual({ revenue: 30, cost: 18, profit: 12, count: 2 });
    expect(res.body.lines[0]).toMatchObject({ item: 'Dolo 650', quantity: 10, revenue: 20, cost: 12, profit: 8, costEstimated: false, setting: 'OPD', doctorName: 'Asha Rao', patientName: 'Meera Joshi' });
    expect(res.body.lines[0].receiptNo).toMatch(/^PH-/);
    expect(res.body.lines[1]).toMatchObject({ doctorId: null, patientName: 'Walk In' });
    expect(res.body.byDay).toEqual([{ date: day, revenue: 30, cost: 18, profit: 12 }]);
    expect(res.body.byItem).toEqual([{ item: 'Dolo 650', quantity: 15, revenue: 30, cost: 18, profit: 12 }]);

    const lab = await request(app).get(`/api/reports/department?department=LAB&${range}`).set(auth(adminToken));
    expect(lab.body.totals).toEqual({ revenue: 300, cost: 100, profit: 200, count: 1 });
  });

  it('shows a counter only its own department, and not doctors', async () => {
    const { pharmacist, doctorToken, labTech } = await clinicWithSales();
    expect((await request(app).get(`/api/reports/department?department=LAB&${range}`).set(auth(pharmacist))).status).toBe(403);
    expect((await request(app).get(`/api/reports/department?department=LAB&${range}`).set(auth(labTech))).status).toBe(200);
    expect((await request(app).get(`/api/reports/department?department=PHARMACY&${range}`).set(auth(doctorToken))).status).toBe(403);
  });

  it('estimates the cost of an older sale from today’s list cost', async () => {
    const { clinic, adminToken } = await clinicWithSales();
    await prisma.pharmacySaleItem.updateMany({ where: { sale: { clinicId: clinic.id } }, data: { unitCost: null } });
    await prisma.pharmacyItem.updateMany({ where: { clinicId: clinic.id }, data: { costPricePerUnit: 1 } });
    const res = await request(app).get(`/api/reports/department?department=PHARMACY&${range}`).set(auth(adminToken));
    expect(res.body.lines[0]).toMatchObject({ cost: 10, profit: 10, costEstimated: true });
  });

  it('is a Tier 2 report', async () => {
    const { adminToken } = await setupClinicWithAdmin({ tier: 1 });
    expect((await request(app).get(`/api/reports/department?department=PHARMACY&${range}`).set(auth(adminToken))).status).toBe(403);
    expect((await request(app).get(`/api/reports/doctor-share?${range}`).set(auth(adminToken))).status).toBe(403);
  });
});

describe('Doctor profit share', () => {
  it('admin sets a clinic default and a doctor’s own rate; the share is that percent of the profit', async () => {
    const { adminToken, doctor, doctorToken, other } = await clinicWithSales();
    const set = await request(app)
      .put('/api/reports/profit-share-rates')
      .set(auth(adminToken))
      .send({
        rates: [
          { doctorId: null, department: 'PHARMACY', percent: 10 },
          { doctorId: null, department: 'LAB', percent: 20 },
          { doctorId: null, department: 'RADIOLOGY', percent: 0 },
          { doctorId: doctor.doctorProfile.id, department: 'RADIOLOGY', percent: 30 },
          { doctorId: other.doctorProfile.id, department: 'LAB', percent: null },
        ],
      });
    expect(set.status).toBe(200);
    expect(set.body).toHaveLength(4);

    const res = await request(app).get(`/api/reports/doctor-share?${range}`).set(auth(adminToken));
    expect(res.status).toBe(200);
    const mine = res.body.rows.filter((r: any) => r.doctorId === doctor.doctorProfile.id);
    expect(mine).toEqual([
      { doctorId: doctor.doctorProfile.id, doctorName: 'Asha Rao', department: 'LAB', revenue: 300, cost: 100, profit: 200, percent: 20, share: 40 },
      { doctorId: doctor.doctorProfile.id, doctorName: 'Asha Rao', department: 'PHARMACY', revenue: 20, cost: 12, profit: 8, percent: 10, share: 0.8 },
      { doctorId: doctor.doctorProfile.id, doctorName: 'Asha Rao', department: 'RADIOLOGY', revenue: 500, cost: 200, profit: 300, percent: 30, share: 90 },
    ]);
    // Over the counter: shown, no share.
    expect(res.body.rows.find((r: any) => r.doctorId === null)).toMatchObject({ department: 'PHARMACY', revenue: 10, share: 0 });
    expect(res.body.totals).toEqual({ revenue: 830, cost: 318, profit: 512, share: 130.8 });

    // The doctor sees their own share and rates, and can't change them.
    const own = await request(app).get(`/api/reports/doctor-share?${range}`).set(auth(doctorToken));
    expect(own.body.rows).toHaveLength(3);
    expect(own.body.totals.share).toBe(130.8);
    const ownRates = await request(app).get('/api/reports/profit-share-rates').set(auth(doctorToken));
    expect(ownRates.body).toHaveLength(4);
    expect((await request(app).put('/api/reports/profit-share-rates').set(auth(doctorToken)).send({ rates: [] })).status).toBe(403);

    // Clearing the doctor's own rate falls back to the default (0 for radiology).
    await request(app)
      .put('/api/reports/profit-share-rates')
      .set(auth(adminToken))
      .send({ rates: [{ doctorId: doctor.doctorProfile.id, department: 'RADIOLOGY', percent: null }] });
    const after = await request(app).get(`/api/reports/doctor-share?${range}`).set(auth(adminToken));
    expect(after.body.rows.find((r: any) => r.doctorId === doctor.doctorProfile.id && r.department === 'RADIOLOGY')).toMatchObject({ percent: 0, share: 0 });
  });

  it('refuses bad rates and another clinic’s doctor', async () => {
    const { adminToken } = await clinicWithSales();
    const { clinic: otherClinic } = await setupClinicWithAdmin({ tier: 2 });
    const stranger = await createDoctor(otherClinic.id);
    const put = (rates: unknown) => request(app).put('/api/reports/profit-share-rates').set(auth(adminToken)).send({ rates });
    expect((await put([{ doctorId: null, department: 'LAB', percent: 120 }])).status).toBe(400);
    expect((await put([{ doctorId: stranger.doctorProfile.id, department: 'LAB', percent: 10 }])).status).toBe(404);
  });
});

describe('Diet plans on an admission', () => {
  it('refuses an admission that is not this patient’s', async () => {
    const { clinic, doctorToken } = await clinicWithSales();
    const { user: patient } = await createUser(clinic.id, 'PATIENT');
    const res = await request(app)
      .post('/api/diet-plans')
      .set(auth(doctorToken))
      .send({ patientId: patient.id, admissionId: 'no-such-admission', dietaryPreference: 'VEG', planText: 'Soft diet' });
    expect(res.status).toBe(404);
    const ok = await request(app).post('/api/diet-plans').set(auth(doctorToken)).send({ patientId: patient.id, dietaryPreference: 'NON_VEG', planText: 'Soft diet' });
    expect(ok.body).toMatchObject({ admissionId: null, dietaryPreference: 'NON_VEG' });
  });
});
