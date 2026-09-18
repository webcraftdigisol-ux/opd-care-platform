import request from 'supertest';
import { app, prisma, setupClinicWithAdmin, createUser, createDoctor, auth } from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Pharmacy: strip vs. per-unit pricing', () => {
  it('always prices a sale as quantityInUnits x pricePerUnit, regardless of unitsPerStrip metadata', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 2, taxPercent: 0 });
    const { user: patient } = await createUser(clinic.id, 'PATIENT');

    // A strip of 10 tablets at ₹2/tablet -- unitsPerStrip is display metadata
    // only, never a multiplier baked into the price.
    const item = await prisma.pharmacyItem.create({
      data: { clinicId: clinic.id, name: 'Paracetamol 500mg', unitsPerStrip: 10, pricePerUnit: 2, costPricePerUnit: 1, stockUnits: 100 },
    });

    const sale = await request(app)
      .post('/api/pharmacy/sales')
      .set(auth(adminToken))
      .send({
        patientId: patient.id,
        items: [{ itemId: item.id, medicineName: item.name, quantity: 23, unitPrice: 2 }],
      });

    expect(sale.status).toBe(201);
    expect(sale.body.subtotal).toBe(46); // 23 units x ₹2, not 23 strips
    expect(sale.body.total).toBe(46);

    const updatedItem = await prisma.pharmacyItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(updatedItem.stockUnits).toBe(100 - 23); // decremented in units, not strips
  });
});

describe('Pharmacy: own-recorded-charge invariant in Reports', () => {
  it("a billed prescription's contribution to the financial report never changes when the catalog price changes later", async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 2, taxPercent: 0 });
    const { user: patient } = await createUser(clinic.id, 'PATIENT');
    const { doctorProfile } = await createDoctor(clinic.id);

    const item = await prisma.pharmacyItem.create({
      data: { clinicId: clinic.id, name: 'Amoxicillin 250mg', unitsPerStrip: 10, pricePerUnit: 5, costPricePerUnit: 3, stockUnits: 100 },
    });

    const appointment = await prisma.appointment.create({
      data: { clinicId: clinic.id, patientId: patient.id, doctorId: doctorProfile.id, date: new Date(), tokenNumber: 1, status: 'COMPLETED' },
    });
    const consultation = await prisma.consultation.create({ data: { appointmentId: appointment.id } });
    const prescription = await prisma.prescription.create({
      data: { consultationId: consultation.id, medicine: 'Amoxicillin 250mg', dosage: '250mg', frequency: 'BD', durationDays: 5 },
    });

    // Dispense at the catalog price in effect right now (₹5/unit x 10 units = ₹50).
    const sale = await request(app)
      .post('/api/pharmacy/sales')
      .set(auth(adminToken))
      .send({
        patientId: patient.id,
        appointmentId: appointment.id,
        items: [{ prescriptionId: prescription.id, itemId: item.id, medicineName: item.name, quantity: 10, unitPrice: 5 }],
      });
    expect(sale.status).toBe(201);
    expect(sale.body.total).toBe(50);

    const from = '2020-01-01';
    const to = '2030-01-01';
    const reportBefore = await request(app)
      .get(`/api/reports/financial?from=${from}&to=${to}`)
      .set(auth(adminToken));
    expect(reportBefore.status).toBe(200);
    const rowBefore = reportBefore.body.pharmacy.byItem.find((r: any) => r.name === 'Amoxicillin 250mg');
    expect(rowBefore.actualTotal).toBe(50);
    expect(rowBefore.orderedTotal).toBe(50); // billed -> "ordered" uses the same recorded charge

    // Now the catalog price changes -- this must NOT move the already-billed figures.
    await request(app)
      .put(`/api/pharmacy/items/${item.id}`)
      .set(auth(adminToken))
      .send({ pricePerUnit: 9 });

    const reportAfter = await request(app)
      .get(`/api/reports/financial?from=${from}&to=${to}`)
      .set(auth(adminToken));
    const rowAfter = reportAfter.body.pharmacy.byItem.find((r: any) => r.name === 'Amoxicillin 250mg');
    expect(rowAfter.actualTotal).toBe(50);
    expect(rowAfter.orderedTotal).toBe(50);
    expect(rowAfter.actualTotal).not.toBe(10 * 9); // would be 90 if it had re-derived from the new price
  });

  it('an UNbilled prescription is valued at the CURRENT catalog price (only billed items freeze their charge)', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 2, taxPercent: 0 });
    const { user: patient } = await createUser(clinic.id, 'PATIENT');
    const { doctorProfile } = await createDoctor(clinic.id);

    await prisma.pharmacyItem.create({
      data: { clinicId: clinic.id, name: 'Cetirizine 10mg', unitsPerStrip: 10, pricePerUnit: 1.5, costPricePerUnit: 0.8, stockUnits: 100 },
    });

    const appointment = await prisma.appointment.create({
      data: { clinicId: clinic.id, patientId: patient.id, doctorId: doctorProfile.id, date: new Date(), tokenNumber: 1, status: 'COMPLETED' },
    });
    const consultation = await prisma.consultation.create({ data: { appointmentId: appointment.id } });
    await prisma.prescription.create({
      data: { consultationId: consultation.id, medicine: 'Cetirizine 10mg', dosage: '10mg', frequency: 'OD', durationDays: 5 },
    });

    const from = '2020-01-01';
    const to = '2030-01-01';
    const report = await request(app).get(`/api/reports/financial?from=${from}&to=${to}`).set(auth(adminToken));
    const row = report.body.pharmacy.byItem.find((r: any) => r.name === 'Cetirizine 10mg');
    // suggestedQty for OD x 5 days = 5 units, valued at the live catalog price 1.5
    expect(row.orderedQuantity).toBe(5);
    expect(row.orderedTotal).toBe(7.5);
    expect(row.actualTotal).toBe(0); // never dispensed
  });
});
