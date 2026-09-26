import request from 'supertest';
import { app, prisma, setupClinicWithAdmin, createUser, createDoctor, loginAs, auth } from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

const today = () => new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function staff(clinic: { id: string; slug: string }, role: 'PHARMACIST' | 'LAB_TECHNICIAN' | 'RADIOLOGY_TECHNICIAN' | 'DOCTOR') {
  const { user, password } = await createUser(clinic.id, role);
  return (await loginAs(clinic.slug, user.email, password)).token as string;
}

// A Tier 2 clinic with a doctor's visit today: Dolo 650 and Pan 40
// prescribed, a CBC and a chest X-ray ordered.
async function visitWithOrders() {
  const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 2, taxPercent: 0 });
  const doctor = await createDoctor(clinic.id);
  const doctorToken = (await loginAs(clinic.slug, doctor.user.email, doctor.password)).token as string;
  const { user: patient } = await createUser(clinic.id, 'PATIENT', { name: 'Meera Joshi' });
  const appointment = await prisma.appointment.create({
    data: { clinicId: clinic.id, patientId: patient.id, doctorId: doctor.doctorProfile.id, date: today(), tokenNumber: 1, status: 'COMPLETED' },
  });
  const consultation = await prisma.consultation.create({
    data: {
      appointmentId: appointment.id,
      diagnosis: 'Viral fever',
      prescriptions: {
        create: [
          { medicine: 'Paracetamol', strength: '650 mg', brand: 'Dolo 650', dosage: '1 tab', frequency: '1-0-1', durationDays: 5 },
          { medicine: 'Pantoprazole', strength: '40 mg', brand: 'Pan 40', dosage: '1 tab', frequency: '1-0-0', durationDays: 5 },
        ],
      },
      labTestsOrdered: { create: [{ testName: 'CBC' }] },
      radiologyOrdered: { create: [{ testName: 'Chest X-Ray PA' }] },
    },
    include: { prescriptions: true, labTestsOrdered: true, radiologyOrdered: true },
  });
  const dolo = consultation.prescriptions.find((p) => p.brand === 'Dolo 650')!;
  const pan = consultation.prescriptions.find((p) => p.brand === 'Pan 40')!;
  return { clinic, adminToken, doctor, doctorToken, patient, appointment, consultation, dolo, pan };
}

describe('Tier 2 department lists (settings)', () => {
  it('loads the standard medicine list one row per brand, unpriced, and only once; adds the doctors’ own catalogue items too', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 2 });
    const pharmacist = await staff(clinic, 'PHARMACIST');
    await prisma.doctorCatalogItem.create({ data: { clinicId: clinic.id, kind: 'MEDICINE', name: 'Clinic Special Tonic', strength: '200 ml', brands: ['TonicX'] } });

    const first = await request(app).post('/api/pharmacy/items/starter').set(auth(pharmacist));
    expect(first.status).toBe(200);
    expect(first.body.added).toBeGreaterThan(500);
    const items = await prisma.pharmacyItem.findMany({ where: { clinicId: clinic.id } });
    expect(items).toHaveLength(first.body.added);
    expect(items.every((i) => i.pricePerUnit === 0 && i.costPricePerUnit === 0)).toBe(true);
    expect(items.filter((i) => i.name === 'Paracetamol' && i.strength === '650 mg').map((i) => i.brand)).toEqual(
      expect.arrayContaining(['Dolo 650', 'Calpol 650']),
    );
    expect(items.some((i) => i.brand === 'TonicX' && i.strength === '200 ml')).toBe(true);

    const again = await request(app).post('/api/pharmacy/items/starter').set(auth(adminToken));
    expect(again.body.added).toBe(0);

    const lab = await request(app).post('/api/lab/catalog/starter').set(auth(adminToken));
    const radiology = await request(app).post('/api/radiology/catalog/starter').set(auth(adminToken));
    expect(lab.body.added).toBeGreaterThan(50);
    expect(radiology.body.added).toBeGreaterThan(30);
    expect((await request(app).post('/api/lab/catalog/starter').set(auth(adminToken))).body.added).toBe(0);
  });

  it('a pharmacist adds a medicine with strength, brand, cost and MRP, edits it, and a duplicate is refused', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 2 });
    const pharmacist = await staff(clinic, 'PHARMACIST');
    const created = await request(app)
      .post('/api/pharmacy/items')
      .set(auth(pharmacist))
      .send({ name: 'Paracetamol', strength: '650 mg', brand: 'Dolo 650', costPricePerUnit: 1.2, pricePerUnit: 2.1 });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Paracetamol', strength: '650 mg', brand: 'Dolo 650', stockUnits: 0 });

    const dup = await request(app)
      .post('/api/pharmacy/items')
      .set(auth(pharmacist))
      .send({ name: 'paracetamol', strength: '650 mg', brand: 'dolo 650', costPricePerUnit: 1, pricePerUnit: 2 });
    expect(dup.status).toBe(409);

    const edited = await request(app).put(`/api/pharmacy/items/${created.body.id}`).set(auth(pharmacist)).send({ brand: 'Calpol 650', pricePerUnit: 1.9 });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ brand: 'Calpol 650', pricePerUnit: 1.9 });

    // A lab test can be listed before it's priced.
    const labTech = await staff(clinic, 'LAB_TECHNICIAN');
    expect((await request(app).post('/api/lab/catalog').set(auth(labTech)).send({ name: 'HbA1c', price: 0 })).status).toBe(201);
    expect((await request(app).post('/api/lab/catalog').set(auth(labTech)).send({ name: 'hba1c', price: 400 })).status).toBe(409);
  });

  it('the prescription suggestions offer the pharmacy’s medicines with strength and every brand', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 2 });
    const doctor = await createDoctor(clinic.id);
    const token = (await loginAs(clinic.slug, doctor.user.email, doctor.password)).token;
    await prisma.pharmacyItem.createMany({
      data: ['Dolo 650', 'Calpol 650'].map((brand) => ({ clinicId: clinic.id, name: 'Paracetamol', strength: '650 mg', brand, pricePerUnit: 2, costPricePerUnit: 1 })),
    });
    const res = await request(app).get('/api/catalogue/suggestions').set(auth(token));
    const para = res.body.medicines.find((m: any) => m.name === 'Paracetamol' && m.strength === '650 mg');
    expect(para.brands).toEqual(expect.arrayContaining(['Dolo 650', 'Calpol 650']));
  });
});

describe('Tier 2 pharmacy counter', () => {
  it('queues the patient, offers same-composition substitutes, dispenses a substitute onto a receipt, and refuses a second dispense', async () => {
    const { clinic, patient, appointment, dolo, pan } = await visitWithOrders();
    const pharmacist = await staff(clinic, 'PHARMACIST');
    const [doloItem, calpolItem] = await Promise.all(
      ['Dolo 650', 'Calpol 650'].map((brand) =>
        prisma.pharmacyItem.create({ data: { clinicId: clinic.id, name: 'Paracetamol', strength: '650 mg', brand, pricePerUnit: 2, costPricePerUnit: 1, stockUnits: brand === 'Dolo 650' ? 0 : 30 } }),
      ),
    );

    const queue = await request(app).get('/api/pharmacy/queue').set(auth(pharmacist));
    expect(queue.status).toBe(200);
    const entry = queue.body.find((q: any) => q.patient.id === patient.id);
    expect(entry).toMatchObject({ pending: 2, total: 2, patient: { name: 'Meera Joshi' } });
    expect(entry.patient.patientCode).toMatch(/^PT\d{6}$/);

    const orders = await request(app).get(`/api/pharmacy/patients/${patient.id}/orders`).set(auth(pharmacist));
    expect(orders.status).toBe(200);
    const line = orders.body.visits[0].lines.find((l: any) => l.prescriptionId === dolo.id);
    expect(line.label).toBe('Dolo 650 (Paracetamol 650 mg)');
    expect(line.match.id).toBe(doloItem!.id); // the prescribed brand first...
    expect(line.substitutes.map((s: any) => s.brand)).toEqual(['Dolo 650', 'Calpol 650']); // ...then others of the same composition
    expect(line.suggestedQuantity).toBe(10);

    // Dolo is out: Calpol is dispensed instead.
    const sale = await request(app)
      .post('/api/pharmacy/sales')
      .set(auth(pharmacist))
      .send({ patientId: patient.id, items: [{ prescriptionId: dolo.id, itemId: calpolItem!.id, medicineName: 'Calpol 650 (Paracetamol 650 mg)', quantity: 10, unitPrice: 2 }] });
    expect(sale.status).toBe(201);
    expect(sale.body.appointmentId).toBe(appointment.id); // billed against the visit, so it counts for the doctor
    expect(sale.body.items[0].substitutedFor).toBe('Dolo 650 (Paracetamol 650 mg)');
    expect((await prisma.pharmacyItem.findUniqueOrThrow({ where: { id: calpolItem!.id } })).stockUnits).toBe(20);
    expect((await prisma.pharmacyItem.findUniqueOrThrow({ where: { id: doloItem!.id } })).stockUnits).toBe(0);

    const again = await request(app)
      .post('/api/pharmacy/sales')
      .set(auth(pharmacist))
      .send({ patientId: patient.id, items: [{ prescriptionId: dolo.id, medicineName: 'Dolo 650', quantity: 10, unitPrice: 2 }] });
    expect(again.status).toBe(409);

    // Pan 40 isn't stocked: mark it, and the patient leaves the queue.
    expect((await request(app).post(`/api/pharmacy/prescriptions/${pan.id}/skip`).set(auth(pharmacist)).send({ reason: 'Not in stock' })).status).toBe(204);
    const after = await request(app).get('/api/pharmacy/queue').set(auth(pharmacist));
    expect(after.body.find((q: any) => q.patient.id === patient.id)).toBeUndefined();
    const lines = (await request(app).get(`/api/pharmacy/patients/${patient.id}/orders`).set(auth(pharmacist))).body.visits[0].lines;
    expect(lines.find((l: any) => l.prescriptionId === dolo.id)).toMatchObject({ status: 'DONE' });
    expect(lines.find((l: any) => l.prescriptionId === pan.id)).toMatchObject({ status: 'SKIPPED', skipReason: 'Not in stock' });

    // The receipt.
    await request(app).post('/api/payments').set(auth(pharmacist)).send({ billType: 'PHARMACY', billId: sale.body.id, amount: 15, method: 'UPI' });
    const receipt = await request(app).get(`/api/receipts/pharmacy/${sale.body.id}`).set(auth(pharmacist));
    expect(receipt.status).toBe(200);
    expect(receipt.body).toMatchObject({ billType: 'PHARMACY', total: 20, paid: 15, balance: 5, patient: { name: 'Meera Joshi' } });
    expect(receipt.body.receiptNo).toMatch(/^PH-\d{6}-[0-9A-F]{4}$/);
    expect(receipt.body.lines[0]).toMatchObject({ description: 'Calpol 650 (Paracetamol 650 mg)', detail: 'In place of Dolo 650 (Paracetamol 650 mg)', quantity: 10, amount: 20 });

    // Each counter prints only its own receipts.
    const labTech = await staff(clinic, 'LAB_TECHNICIAN');
    expect((await request(app).get(`/api/receipts/pharmacy/${sale.body.id}`).set(auth(labTech))).status).toBe(403);
  });

  it('refuses a prescription line that belongs to another patient', async () => {
    const { clinic, dolo } = await visitWithOrders();
    const pharmacist = await staff(clinic, 'PHARMACIST');
    const { user: other } = await createUser(clinic.id, 'PATIENT');
    const res = await request(app)
      .post('/api/pharmacy/sales')
      .set(auth(pharmacist))
      .send({ patientId: other.id, items: [{ prescriptionId: dolo.id, medicineName: 'Dolo 650', quantity: 1, unitPrice: 2 }] });
    expect(res.status).toBe(404);
  });
});

describe('Tier 2 lab and radiology counters', () => {
  it('does an ordered test under the lab’s own name, records the result later, and skips a scan', async () => {
    const { clinic, patient, appointment, consultation } = await visitWithOrders();
    const labTech = await staff(clinic, 'LAB_TECHNICIAN');
    const cbc = await prisma.labTestCatalog.create({ data: { clinicId: clinic.id, name: 'Complete Blood Count (CBC)', price: 300 } });

    const orders = await request(app).get(`/api/lab/patients/${patient.id}/orders`).set(auth(labTech));
    const line = orders.body.visits[0].lines[0];
    expect(line).toMatchObject({ testName: 'CBC', status: 'PENDING' });
    expect(line.match.id).toBe(cbc.id);

    const invoice = await request(app)
      .post('/api/lab/invoices')
      .set(auth(labTech))
      .send({ patientId: patient.id, items: [{ orderId: line.orderId, catalogItemId: cbc.id, testName: cbc.name, price: 300 }] });
    expect(invoice.status).toBe(201);
    expect(invoice.body.appointmentId).toBe(appointment.id);
    expect(invoice.body.items[0]).toMatchObject({ substitutedFor: 'CBC', resultText: null });

    const itemId = invoice.body.items[0].id;
    expect((await request(app).patch(`/api/lab/results/${itemId}`).set(auth(labTech)).send({ resultText: 'Hb 13.2 g/dL' })).status).toBe(204);
    const after = await request(app).get(`/api/lab/patients/${patient.id}/orders`).set(auth(labTech));
    expect(after.body.visits[0].lines[0]).toMatchObject({ status: 'DONE' });
    expect(after.body.invoices[0].items[0].resultText).toBe('Hb 13.2 g/dL');
    expect((await request(app).get('/api/lab/queue').set(auth(labTech))).body).toHaveLength(0);

    // Radiology: the patient goes elsewhere for the X-ray.
    const radTech = await staff(clinic, 'RADIOLOGY_TECHNICIAN');
    expect((await request(app).get('/api/radiology/queue').set(auth(radTech))).body).toHaveLength(1);
    const xray = consultation.radiologyOrdered[0]!;
    expect((await request(app).post(`/api/radiology/orders/${xray.id}/skip`).set(auth(radTech)).send({ reason: 'Getting it done outside' })).status).toBe(204);
    expect((await request(app).get('/api/radiology/queue').set(auth(radTech))).body).toHaveLength(0);
    expect((await request(app).delete(`/api/radiology/orders/${xray.id}/skip`).set(auth(radTech))).status).toBe(204);
    expect((await request(app).get('/api/radiology/queue').set(auth(radTech))).body).toHaveLength(1);

    // Another department's orders are off limits.
    expect((await request(app).post(`/api/radiology/orders/${xray.id}/skip`).set(auth(labTech)).send({})).status).toBe(403);
  });
});

describe('Tier 2 reports: in-house revenue by department', () => {
  it('values what was prescribed/ordered vs what was done in-house, per department in rupees; doctors see their own, counters their own department', async () => {
    const { clinic, adminToken, doctorToken, patient, appointment, dolo, pan, consultation } = await visitWithOrders();
    await prisma.appointment.update({ where: { id: appointment.id }, data: { consultationFee: 500 } });
    const pharmacist = await staff(clinic, 'PHARMACIST');
    const item = await prisma.pharmacyItem.create({ data: { clinicId: clinic.id, name: 'Paracetamol', strength: '650 mg', brand: 'Calpol 650', pricePerUnit: 2, costPricePerUnit: 1 } });
    await prisma.pharmacyItem.create({ data: { clinicId: clinic.id, name: 'Pantoprazole', strength: '40 mg', brand: 'Pan 40', pricePerUnit: 3, costPricePerUnit: 2 } });
    await prisma.radiologyCatalog.create({ data: { clinicId: clinic.id, name: 'Chest X-Ray PA', price: 400 } });
    await request(app)
      .post('/api/pharmacy/sales')
      .set(auth(pharmacist))
      .send({ patientId: patient.id, items: [{ prescriptionId: dolo.id, itemId: item.id, medicineName: 'Calpol 650 (Paracetamol 650 mg)', quantity: 10, unitPrice: 2 }] });
    await request(app).post(`/api/pharmacy/prescriptions/${pan.id}/skip`).set(auth(pharmacist)).send({ reason: 'Buying outside' });
    const labTech = await staff(clinic, 'LAB_TECHNICIAN');
    await request(app)
      .post('/api/lab/invoices')
      .set(auth(labTech))
      .send({ patientId: patient.id, items: [{ orderId: consultation.labTestsOrdered[0]!.id, testName: 'CBC', price: 300 }] });

    // Another doctor's visit (not seen yet, so no fee), with an unpriced medicine.
    const other = await createDoctor(clinic.id);
    const a2 = await prisma.appointment.create({ data: { clinicId: clinic.id, patientId: patient.id, doctorId: other.doctorProfile.id, date: today(), tokenNumber: 2 } });
    await prisma.consultation.create({ data: { appointmentId: a2.id, prescriptions: { create: [{ medicine: 'Cetirizine', dosage: '1', frequency: '0-0-1', durationDays: 3 }] } } });

    const range = `from=${ymd(today())}&to=${ymd(today())}`;
    const mine = await request(app).get(`/api/reports/orders?${range}`).set(auth(doctorToken));
    expect(mine.status).toBe(200);
    expect(mine.body.departments).toEqual(['CONSULTATION', 'PHARMACY', 'LAB', 'RADIOLOGY']);
    const byDept = Object.fromEntries(mine.body.summary.map((s: any) => [s.department, s]));
    expect(byDept.CONSULTATION).toMatchObject({ ordered: 500, inHouse: 500, notInHouse: 0 });
    // Calpol dispensed for Dolo (₹20); Pan 40 bought outside, 5 tabs × ₹3.
    expect(byDept.PHARMACY).toEqual({ department: 'PHARMACY', ordered: 35, inHouse: 20, notInHouse: 15, hasUnpriced: false });
    expect(byDept.LAB).toMatchObject({ ordered: 300, inHouse: 300, notInHouse: 0 });
    expect(byDept.RADIOLOGY).toMatchObject({ ordered: 400, inHouse: 0, notInHouse: 400 });
    expect(mine.body.byDay).toHaveLength(1);
    expect(mine.body.byDay[0].cells.map((c: any) => c.inHouse)).toEqual([500, 20, 300, 0]);

    const all = await request(app).get(`/api/reports/orders?${range}`).set(auth(adminToken));
    const pharmacy = all.body.summary.find((s: any) => s.department === 'PHARMACY');
    expect(pharmacy).toMatchObject({ ordered: 35, inHouse: 20, hasUnpriced: true });
    expect(all.body.byDoctor).toHaveLength(2);

    // A counter sees only its own department, in both reports.
    const pharmacyOnly = await request(app).get(`/api/reports/orders?${range}&departments=LAB,RADIOLOGY`).set(auth(pharmacist));
    expect(pharmacyOnly.body.summary.map((s: any) => s.department)).toEqual(['PHARMACY']);
    const revenue = await request(app).get(`/api/reports/transactions?${range}`).set(auth(pharmacist));
    expect(revenue.status).toBe(200);
    expect(new Set(revenue.body.rows.map((r: any) => r.billType))).toEqual(new Set(['PHARMACY']));
    expect((await request(app).get('/api/reports/daily-activity').set(auth(pharmacist))).status).toBe(403);
    expect((await request(app).get('/api/reports/follow-ups').set(auth(labTech))).status).toBe(403);
  });

  it('is a Tier 2 report', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    void clinic;
    const res = await request(app).get(`/api/reports/orders?from=${ymd(today())}&to=${ymd(today())}`).set(auth(adminToken));
    expect(res.status).toBe(403);
  });
});
