import request from 'supertest';
import { app, prisma, setupClinicWithAdmin, createUser, createDoctor, auth } from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

async function admit(clinicId: string, adminToken: string, opts: { depositAmount?: number } = {}) {
  const { user: patient } = await createUser(clinicId, 'PATIENT');
  const { doctorProfile } = await createDoctor(clinicId);
  const ward = await prisma.ward.create({ data: { clinicId, name: 'General Ward' } });
  const bed = await prisma.bed.create({ data: { wardId: ward.id, label: 'G-1', dailyRate: 1200 } });

  const res = await request(app)
    .post('/api/ipd/admissions')
    .set(auth(adminToken))
    .send({ patientId: patient.id, bedId: bed.id, admittingDoctorId: doctorProfile.id, depositAmount: opts.depositAmount ?? 0 })
    .expect(201);

  return { patient, doctorProfile, ward, bed, admissionId: res.body.id as string };
}

describe('IPD discharge billing', () => {
  it('nets a large deposit against a small bill and reports it as a refund (negative amountDue), not an error', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 3, taxPercent: 5 });
    const { admissionId } = await admit(clinic.id, adminToken, { depositAmount: 20000 });

    const discharge = await request(app)
      .post(`/api/ipd/admissions/${admissionId}/discharge`)
      .set(auth(adminToken))
      .send({});
    expect(discharge.status).toBe(200);

    const bill = discharge.body.bill;
    expect(bill.total).toBeGreaterThan(0);
    expect(bill.amountDue).toBeLessThan(0);
    expect(bill.amountDue).toBe(Math.round((bill.total - 20000) * 100) / 100);
  });

  it('rolls a linked radiology invoice into the discharge bill as a pre-tax-inclusive charge (never double-taxed)', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 3, taxPercent: 5 });
    const { patient, admissionId } = await admit(clinic.id, adminToken, { depositAmount: 0 });

    const radInvoice = await request(app)
      .post('/api/radiology/invoices')
      .set(auth(adminToken))
      .send({
        patientId: patient.id,
        admissionId,
        items: [{ testName: 'Chest X-Ray', price: 400 }],
      });
    expect(radInvoice.status).toBe(201);
    expect(radInvoice.body.total).toBe(420); // 400 + 5% tax, already tax-inclusive

    const preview = await request(app).get(`/api/ipd/admissions/${admissionId}/bill-preview`).set(auth(adminToken));
    expect(preview.body.radiologyCharges).toBe(420);
    // Room charges (subtotal) get the clinic's tax; radiology's own tax is
    // NOT applied a second time on top of its already-tax-inclusive total.
    expect(preview.body.total).toBe(
      Math.round((preview.body.subtotal + preview.body.taxAmount + preview.body.radiologyCharges) * 100) / 100,
    );
  });

  it("a radiology charge's contribution to the discharge bill is frozen at invoice time, even if the catalog price changes before discharge", async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 3, taxPercent: 0 });
    const { patient, admissionId } = await admit(clinic.id, adminToken);

    const catalogEntry = await prisma.radiologyCatalog.create({
      data: { clinicId: clinic.id, name: 'MRI - Knee', price: 6000 },
    });

    const invoice = await request(app)
      .post('/api/radiology/invoices')
      .set(auth(adminToken))
      .send({
        patientId: patient.id,
        admissionId,
        items: [{ testName: 'MRI - Knee', catalogItemId: catalogEntry.id, price: catalogEntry.price }],
      });
    expect(invoice.body.total).toBe(6000);

    // Catalog price moves after the invoice is already recorded.
    await prisma.radiologyCatalog.update({ where: { id: catalogEntry.id }, data: { price: 9000 } });

    const discharge = await request(app)
      .post(`/api/ipd/admissions/${admissionId}/discharge`)
      .set(auth(adminToken))
      .send({});
    expect(discharge.body.bill.radiologyCharges).toBe(6000); // still the invoice's own recorded total, not 9000
  });
});

describe('IPD bed claims under concurrency', () => {
  it('two simultaneous admissions to the same bed: exactly one gets it', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 3 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const ward = await prisma.ward.create({ data: { clinicId: clinic.id, name: 'Race Ward' } });
    const bed = await prisma.bed.create({ data: { wardId: ward.id, label: 'R-1', dailyRate: 1000 } });
    const patients = await Promise.all([1, 2, 3].map(() => createUser(clinic.id, 'PATIENT')));

    const results = await Promise.all(
      patients.map(({ user }) =>
        request(app)
          .post('/api/ipd/admissions')
          .set(auth(adminToken))
          .send({ patientId: user.id, bedId: bed.id, admittingDoctorId: doctorProfile.id }),
      ),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses[0]).toBe(201);
    for (const status of statuses.slice(1)) expect([400, 409]).toContain(status);
    expect(await prisma.admission.count({ where: { bedId: bed.id, status: 'ADMITTED' } })).toBe(1);
  });
});
