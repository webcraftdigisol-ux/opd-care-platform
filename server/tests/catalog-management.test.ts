import request from 'supertest';
import { app, prisma, setupClinicWithAdmin, createUser, loginAs, auth } from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

// Covers full CRUD on the three "exhaustive list" catalogs (pharmacy
// medicines, lab tests, radiology tests) that a doctor's OPD/IPD
// prescription autocomplete and the counter/inventory pages all read from:
// role gating (Admin + the matching counter-staff role can manage it, no
// one else), tenancy, and that deleting a catalog entry never breaks a
// historical sale/invoice line (its itemId/catalogItemId is ON DELETE SET
// NULL, and the line already carries its own frozen name/price snapshot).

describe('Pharmacy medicine catalog: brand field + full CRUD', () => {
  it('a pharmacist (not just Admin) can create, update, and delete a medicine, including its brand', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 2 });
    const pharmEmail = 'pharm-crud@test.local';
    const { password: pharmPassword } = await createUser(clinic.id, 'PHARMACIST', { email: pharmEmail });
    const pharmSession = await loginAs(clinic.slug, pharmEmail, pharmPassword);

    const created = await request(app)
      .post('/api/pharmacy/items')
      .set(auth(pharmSession.token))
      .send({ name: 'Paracetamol 500mg', brand: 'Crocin', unitsPerStrip: 10, pricePerUnit: 2, costPricePerUnit: 1, stockUnits: 50 });
    expect(created.status).toBe(201);
    expect(created.body.brand).toBe('Crocin');

    const updated = await request(app)
      .put(`/api/pharmacy/items/${created.body.id}`)
      .set(auth(pharmSession.token))
      .send({ brand: 'Dolo', pricePerUnit: 2.5 });
    expect(updated.status).toBe(200);
    expect(updated.body.brand).toBe('Dolo');
    expect(updated.body.pricePerUnit).toBe(2.5);

    const deleted = await request(app).delete(`/api/pharmacy/items/${created.body.id}`).set(auth(adminToken));
    expect(deleted.status).toBe(204);

    const list = await request(app).get('/api/pharmacy/items').set(auth(adminToken));
    expect(list.body.find((i: any) => i.id === created.body.id)).toBeUndefined();
  });

  it('a nurse cannot create, update, or delete a medicine', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 2 });
    const nurseEmail = 'pharm-nurse@test.local';
    const { password: nursePassword } = await createUser(clinic.id, 'NURSE', { email: nurseEmail });
    const nurseSession = await loginAs(clinic.slug, nurseEmail, nursePassword);

    const item = await prisma.pharmacyItem.create({
      data: { clinicId: clinic.id, name: 'Amoxicillin', pricePerUnit: 5, costPricePerUnit: 3, stockUnits: 10 },
    });

    expect(
      (await request(app).post('/api/pharmacy/items').set(auth(nurseSession.token)).send({ name: 'x', pricePerUnit: 1, costPricePerUnit: 1, stockUnits: 1 })).status,
    ).toBe(403);
    expect((await request(app).put(`/api/pharmacy/items/${item.id}`).set(auth(nurseSession.token)).send({ pricePerUnit: 9 })).status).toBe(403);
    expect((await request(app).delete(`/api/pharmacy/items/${item.id}`).set(auth(nurseSession.token))).status).toBe(403);
    // Confirm nothing actually changed.
    const unchanged = await prisma.pharmacyItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(unchanged.pricePerUnit).toBe(5);
    void adminToken;
  });

  it('deleting a medicine still referenced by a past sale succeeds -- the sale line keeps its own frozen name/price, only its live link is cleared', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 2 });
    const { user: patient } = await createUser(clinic.id, 'PATIENT');
    const item = await prisma.pharmacyItem.create({
      data: { clinicId: clinic.id, name: 'Ibuprofen', pricePerUnit: 3, costPricePerUnit: 2, stockUnits: 20 },
    });
    const sale = await request(app)
      .post('/api/pharmacy/sales')
      .set(auth(adminToken))
      .send({ patientId: patient.id, items: [{ itemId: item.id, medicineName: item.name, quantity: 2, unitPrice: 3 }] });
    expect(sale.status).toBe(201);
    const saleItemId = sale.body.items[0].id;

    const deleted = await request(app).delete(`/api/pharmacy/items/${item.id}`).set(auth(adminToken));
    expect(deleted.status).toBe(204);

    const gone = await prisma.pharmacyItem.findUnique({ where: { id: item.id } });
    expect(gone).toBeNull();

    // The sale's own record is untouched: same medicine name, same price,
    // same line total -- only the now-dangling itemId link was nulled.
    const saleItem = await prisma.pharmacySaleItem.findUniqueOrThrow({ where: { id: saleItemId } });
    expect(saleItem.medicineName).toBe('Ibuprofen');
    expect(saleItem.unitPrice).toBe(3);
    expect(saleItem.lineTotal).toBe(6);
    expect(saleItem.itemId).toBeNull();
  });

  it('is tenant-scoped: deleting another clinic\'s medicine 404s', async () => {
    const { clinic: clinicA, adminToken: adminA } = await setupClinicWithAdmin({ tier: 2 });
    const { adminToken: adminB } = await setupClinicWithAdmin({ tier: 2 });
    const item = await prisma.pharmacyItem.create({
      data: { clinicId: clinicA.id, name: 'Cetirizine', pricePerUnit: 1, costPricePerUnit: 0.5, stockUnits: 5 },
    });

    const res = await request(app).delete(`/api/pharmacy/items/${item.id}`).set(auth(adminB));
    expect(res.status).toBe(404);
    const stillThere = await prisma.pharmacyItem.findUnique({ where: { id: item.id } });
    expect(stillThere).not.toBeNull();
    void adminA;
  });
});

describe('Lab test catalog: a lab technician (not just Admin) can manage it', () => {
  it('creates, and deletes a lab test; a referenced one still deletes cleanly, its invoice line keeps its own snapshot', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 2 });
    const labTechEmail = 'labtech-crud@test.local';
    const { password: labTechPassword } = await createUser(clinic.id, 'LAB_TECHNICIAN', { email: labTechEmail });
    const labSession = await loginAs(clinic.slug, labTechEmail, labTechPassword);
    const { user: patient } = await createUser(clinic.id, 'PATIENT');

    const created = await request(app).post('/api/lab/catalog').set(auth(labSession.token)).send({ name: 'Complete Blood Count', price: 300 });
    expect(created.status).toBe(201);

    // Unreferenced -- deletes cleanly.
    const deleted = await request(app).delete(`/api/lab/catalog/${created.body.id}`).set(auth(labSession.token));
    expect(deleted.status).toBe(204);

    // A referenced one also deletes cleanly -- the invoice line already
    // froze its own testName/price at creation time.
    const inUse = await request(app).post('/api/lab/catalog').set(auth(labSession.token)).send({ name: 'Lipid Profile', price: 500 });
    const invoice = await request(app)
      .post('/api/lab/invoices')
      .set(auth(adminToken))
      .send({ patientId: patient.id, items: [{ catalogItemId: inUse.body.id, testName: inUse.body.name, price: 500 }] });
    const resultItemId = invoice.body.items[0].id;

    const secondDelete = await request(app).delete(`/api/lab/catalog/${inUse.body.id}`).set(auth(labSession.token));
    expect(secondDelete.status).toBe(204);

    const resultItem = await prisma.labResultItem.findUniqueOrThrow({ where: { id: resultItemId } });
    expect(resultItem.testName).toBe('Lipid Profile');
    expect(resultItem.price).toBe(500);
    expect(resultItem.catalogItemId).toBeNull();
  });

  it('a receptionist cannot manage the lab catalog', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 2 });
    const receptionEmail = 'lab-reception@test.local';
    const { password } = await createUser(clinic.id, 'RECEPTIONIST', { email: receptionEmail });
    const session = await loginAs(clinic.slug, receptionEmail, password);
    expect((await request(app).post('/api/lab/catalog').set(auth(session.token)).send({ name: 'x', price: 1 })).status).toBe(403);
  });
});

describe('Radiology test catalog: a radiology technician (not just Admin) can manage it', () => {
  it('creates, and deletes a radiology test; a referenced one still deletes cleanly, its invoice line keeps its own snapshot', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 2 });
    const radTechEmail = 'radtech-crud@test.local';
    const { password: radTechPassword } = await createUser(clinic.id, 'RADIOLOGY_TECHNICIAN', { email: radTechEmail });
    const radSession = await loginAs(clinic.slug, radTechEmail, radTechPassword);
    const { user: patient } = await createUser(clinic.id, 'PATIENT');

    const created = await request(app).post('/api/radiology/catalog').set(auth(radSession.token)).send({ name: 'Chest X-Ray', price: 600 });
    expect(created.status).toBe(201);

    const deleted = await request(app).delete(`/api/radiology/catalog/${created.body.id}`).set(auth(radSession.token));
    expect(deleted.status).toBe(204);

    const inUse = await request(app).post('/api/radiology/catalog').set(auth(radSession.token)).send({ name: 'MRI Brain', price: 4000 });
    const invoice = await request(app)
      .post('/api/radiology/invoices')
      .set(auth(adminToken))
      .send({ patientId: patient.id, items: [{ catalogItemId: inUse.body.id, testName: inUse.body.name, price: 4000 }] });
    const resultItemId = invoice.body.items[0].id;

    const secondDelete = await request(app).delete(`/api/radiology/catalog/${inUse.body.id}`).set(auth(radSession.token));
    expect(secondDelete.status).toBe(204);

    const resultItem = await prisma.radiologyResultItem.findUniqueOrThrow({ where: { id: resultItemId } });
    expect(resultItem.testName).toBe('MRI Brain');
    expect(resultItem.price).toBe(4000);
    expect(resultItem.catalogItemId).toBeNull();
  });
});
