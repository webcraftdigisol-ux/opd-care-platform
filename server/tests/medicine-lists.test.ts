import request from 'supertest';
import { app, prisma, setupClinicWithAdmin, createUser, createDoctor, loginAs, uniqueEmail, auth } from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

async function doctorOf(clinic: { id: string; slug: string }) {
  const d = await createDoctor(clinic.id);
  return (await loginAs(clinic.slug, d.user.email, d.password)).token as string;
}

describe('Registering a clinic with its system of medicine', () => {
  it('a Tier 2 Ayurvedic clinic gets the Ayurvedic medicine list and the test lists, unpriced', async () => {
    const res = await request(app)
      .post('/api/clinics/register')
      .send({ clinicName: 'Vaidya Ayurveda', clinicSlug: `vaidya-${Date.now()}`, adminName: 'Admin', adminEmail: uniqueEmail('a'), adminPassword: 'password123', tier: 2, medicineSystem: 'AYURVEDIC', loadStandardLists: true });
    expect(res.status).toBe(201);
    expect(res.body.clinic.medicineSystem).toBe('AYURVEDIC');
    const clinicId = res.body.clinic.id;
    const meds = await prisma.pharmacyItem.findMany({ where: { clinicId } });
    expect(meds.some((m) => m.name === 'Triphala Churna' && m.brand === 'Dabur Triphala Churna')).toBe(true);
    expect(meds.some((m) => m.name === 'Paracetamol')).toBe(false);
    expect(meds.every((m) => m.pricePerUnit === 0)).toBe(true);
    expect(await prisma.labTestCatalog.count({ where: { clinicId } })).toBeGreaterThan(50);
    expect(await prisma.radiologyCatalog.count({ where: { clinicId } })).toBeGreaterThan(30);
    expect(await prisma.doctorCatalogItem.count({ where: { clinicId } })).toBe(0);
  });

  it('a Tier 1 Homeopathic clinic gets the homeopathic remedies in the Doctor’s Catalogue; nothing loads unless asked', async () => {
    const res = await request(app)
      .post('/api/clinics/register')
      .send({ clinicName: 'Similia Homeo', clinicSlug: `similia-${Date.now()}`, adminName: 'Admin', adminEmail: uniqueEmail('a'), adminPassword: 'password123', medicineSystem: 'HOMEOPATHIC', loadStandardLists: true });
    const items = await prisma.doctorCatalogItem.findMany({ where: { clinicId: res.body.clinic.id } });
    expect(items.some((i) => i.name === 'Arnica Montana' && i.strength === '200C')).toBe(true);
    expect(items.some((i) => i.name === 'Paracetamol')).toBe(false);
    expect(items.some((i) => i.kind === 'LAB_TEST')).toBe(true);

    const plain = await request(app)
      .post('/api/clinics/register')
      .send({ clinicName: 'Plain Clinic', clinicSlug: `plain-${Date.now()}`, adminName: 'Admin', adminEmail: uniqueEmail('a'), adminPassword: 'password123' });
    expect(plain.body.clinic.medicineSystem).toBe('ALLOPATHIC');
    expect(await prisma.doctorCatalogItem.count({ where: { clinicId: plain.body.clinic.id } })).toBe(0);
  });

  it('admin changes the system; a mixed clinic’s standard list has all three', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 2 });
    const put = await request(app).put('/api/clinics/me/current').set(auth(adminToken)).send({ medicineSystem: 'MIXED' });
    expect(put.body.medicineSystem).toBe('MIXED');
    const loaded = await request(app).post('/api/pharmacy/items/starter').set(auth(adminToken));
    expect(loaded.body.added).toBeGreaterThan(1500);
    const names = new Set((await prisma.pharmacyItem.findMany({ where: { clinicId: clinic.id }, select: { name: true } })).map((m) => m.name));
    expect(['Paracetamol', 'Chyawanprash', 'Nux Vomica'].every((n) => names.has(n))).toBe(true);
    expect((await request(app).post('/api/pharmacy/items/starter').set(auth(adminToken))).body.added).toBe(0);
    expect((await request(app).put('/api/clinics/me/current').set(auth(adminToken)).send({ medicineSystem: 'UNANI' })).status).toBe(400);
  });
});

describe('Doctors prescribe from the department lists (Tier 2+)', () => {
  it('suggests only the pharmacy, lab and radiology lists -- not the doctor’s catalogue or the standard list', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 2 });
    const doctor = await doctorOf(clinic);
    await prisma.pharmacyItem.create({ data: { clinicId: clinic.id, name: 'Paracetamol', strength: '650 mg', brand: 'Dolo 650', pricePerUnit: 2, costPricePerUnit: 1 } });
    await prisma.labTestCatalog.create({ data: { clinicId: clinic.id, name: 'CBC', price: 300 } });
    await prisma.doctorCatalogItem.create({ data: { clinicId: clinic.id, kind: 'MEDICINE', name: 'Private Tonic', strength: null, brands: [] } });
    const s = await request(app).get('/api/catalogue/suggestions').set(auth(doctor));
    expect(s.body).toEqual({
      source: 'DEPARTMENTS',
      medicines: [{ name: 'Paracetamol', strength: '650 mg', brands: ['Dolo 650'] }],
      labTests: ['CBC'],
      radiology: [],
      standard: { medicines: [], labTests: [], radiology: [] },
    });
  });

  it('a doctor adds a missing medicine or test to the department’s list, unpriced unless given, and it is suggested from then on', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 2 });
    const doctor = await doctorOf(clinic);
    const add = (body: object) => request(app).post('/api/catalogue/add-to-list').set(auth(doctor)).send(body);

    const med = await add({ kind: 'MEDICINE', name: 'Ashwagandha Churna', strength: '100 g', brand: 'Dabur Ashwagandha Churna' });
    expect(med.status).toBe(201);
    expect(med.body).toEqual({ kind: 'MEDICINE', name: 'Ashwagandha Churna', strength: '100 g', brand: 'Dabur Ashwagandha Churna', added: true, list: 'PHARMACY' });
    expect(await prisma.pharmacyItem.findFirst({ where: { clinicId: clinic.id, name: 'Ashwagandha Churna' } })).toMatchObject({ pricePerUnit: 0, stockUnits: 0 });
    // Again, any case: it's already there.
    const again = await add({ kind: 'MEDICINE', name: 'ashwagandha churna', strength: '100 G', brand: 'dabur ashwagandha churna' });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ added: false, name: 'Ashwagandha Churna' });

    const lab = await add({ kind: 'LAB_TEST', name: 'Serum Vitamin D', price: 1200, strength: 'ignored' });
    expect(lab.body).toMatchObject({ list: 'LAB', strength: null, added: true });
    expect(await prisma.labTestCatalog.findFirst({ where: { clinicId: clinic.id, name: 'Serum Vitamin D' } })).toMatchObject({ price: 1200 });
    await add({ kind: 'RADIOLOGY', name: 'USG Neck' });

    const s = await request(app).get('/api/catalogue/suggestions').set(auth(doctor));
    expect(s.body.medicines).toContainEqual({ name: 'Ashwagandha Churna', strength: '100 g', brands: ['Dabur Ashwagandha Churna'] });
    expect(s.body.labTests).toEqual(['Serum Vitamin D']);
    expect(s.body.radiology).toEqual(['USG Neck']);

    const { user, password } = await createUser(clinic.id, 'RECEPTIONIST', { email: uniqueEmail('r') });
    const recep = (await loginAs(clinic.slug, user.email, password)).token as string;
    expect((await request(app).post('/api/catalogue/add-to-list').set(auth(recep)).send({ kind: 'LAB_TEST', name: 'X' })).status).toBe(403);
  });

  it('in Tier 1 it goes into the Doctor’s Catalogue, adding a brand to a medicine already there', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const doctor = await doctorOf(clinic);
    await prisma.doctorCatalogItem.create({ data: { clinicId: clinic.id, kind: 'MEDICINE', name: 'Paracetamol', strength: '650 mg', brands: ['Dolo 650'] } });
    const res = await request(app).post('/api/catalogue/add-to-list').set(auth(doctor)).send({ kind: 'MEDICINE', name: 'paracetamol', strength: '650 mg', brand: 'Calpol 650' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ list: 'CATALOGUE', added: true, name: 'Paracetamol' });
    expect((await prisma.doctorCatalogItem.findFirstOrThrow({ where: { clinicId: clinic.id, name: 'Paracetamol' } })).brands).toEqual(['Dolo 650', 'Calpol 650']);
    const s = await request(app).get('/api/catalogue/suggestions').set(auth(doctor));
    expect(s.body.source).toBe('CATALOGUE');
    expect(s.body.standard.labTests).toContain('CBC (Complete Blood Count)');
  });
});
