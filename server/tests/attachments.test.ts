import request from 'supertest';
import fs from 'fs';
import {
  app,
  prisma,
  setupClinicWithAdmin,
  createUser,
  createDoctor,
  loginAs,
  auth,
} from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

const PDF_BYTES = Buffer.from('%PDF-1.4\n%fake test pdf');
const DICOM_BYTES = Buffer.from('fake dicom bytes for upload testing, not a real parseable file');

async function createLabTech(clinicId: string) {
  const { password } = await createUser(clinicId, 'LAB_TECHNICIAN');
  return { password };
}

async function setupLabInvoice(clinicId: string, clinicSlug: string) {
  const { password: labPassword } = await createUser(clinicId, 'LAB_TECHNICIAN', { email: 'labtech-attach@test.local' });
  const labSession = await loginAs(clinicSlug, 'labtech-attach@test.local', labPassword);
  const { user: patient } = await createUser(clinicId, 'PATIENT');
  const invoiceRes = await request(app)
    .post('/api/lab/invoices')
    .set(auth(labSession.token))
    .send({ patientId: patient.id, items: [{ testName: 'CBC', resultText: 'Normal', price: 100 }] });
  return { labSession, patient, invoiceId: invoiceRes.body.id as string };
}

async function setupRadiologyInvoice(clinicId: string, clinicSlug: string) {
  const { password: radPassword } = await createUser(clinicId, 'RADIOLOGY_TECHNICIAN', { email: 'radtech-attach@test.local' });
  const radSession = await loginAs(clinicSlug, 'radtech-attach@test.local', radPassword);
  const { user: patient } = await createUser(clinicId, 'PATIENT');
  const invoiceRes = await request(app)
    .post('/api/radiology/invoices')
    .set(auth(radSession.token))
    .send({ patientId: patient.id, items: [{ testName: 'Chest X-Ray', price: 400 }] });
  return { radSession, patient, invoiceId: invoiceRes.body.id as string };
}

describe('Attachments: upload, list, download, delete', () => {
  it('a Lab Technician can upload a LAB_REPORT; a Pharmacist cannot', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 2 });
    const { labSession, invoiceId } = await setupLabInvoice(clinic.id, clinic.slug);

    const ok = await request(app)
      .post('/api/attachments')
      .set(auth(labSession.token))
      .field('category', 'LAB_REPORT')
      .field('entityId', invoiceId)
      .attach('file', PDF_BYTES, { filename: 'report.pdf', contentType: 'application/pdf' });
    expect(ok.status).toBe(201);
    expect(ok.body.category).toBe('LAB_REPORT');
    expect(ok.body.fileName).toBe('report.pdf');
    expect(ok.body.sizeBytes).toBe(PDF_BYTES.length);

    const { password: pharmacistPassword } = await createUser(clinic.id, 'PHARMACIST', { email: 'pharm-attach@test.local' });
    const pharmSession = await loginAs(clinic.slug, 'pharm-attach@test.local', pharmacistPassword);
    const denied = await request(app)
      .post('/api/attachments')
      .set(auth(pharmSession.token))
      .field('category', 'LAB_REPORT')
      .field('entityId', invoiceId)
      .attach('file', PDF_BYTES, { filename: 'report.pdf', contentType: 'application/pdf' });
    expect(denied.status).toBe(403);
  });

  it('rejects an unsupported file type', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 2 });
    const { labSession, invoiceId } = await setupLabInvoice(clinic.id, clinic.slug);

    const res = await request(app)
      .post('/api/attachments')
      .set(auth(labSession.token))
      .field('category', 'LAB_REPORT')
      .field('entityId', invoiceId)
      .attach('file', Buffer.from('#!/bin/sh\necho hi'), { filename: 'script.sh', contentType: 'application/x-sh' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/unsupported file type/i);
  });

  it('rejects an upload against an entityId from another clinic (tenancy)', async () => {
    const { clinic: clinicA } = await setupClinicWithAdmin({ tier: 2 });
    const { labSession: labSessionA } = await setupLabInvoice(clinicA.id, clinicA.slug);

    const { clinic: clinicB } = await setupClinicWithAdmin({ tier: 2 });
    const { invoiceId: invoiceIdB } = await setupLabInvoice(clinicB.id, clinicB.slug);

    const res = await request(app)
      .post('/api/attachments')
      .set(auth(labSessionA.token))
      .field('category', 'LAB_REPORT')
      .field('entityId', invoiceIdB)
      .attach('file', PDF_BYTES, { filename: 'report.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(404);
  });

  it("a patient can download their own attachment but not another patient's", async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 2 });
    const { labSession, invoiceId, patient } = await setupLabInvoice(clinic.id, clinic.slug);

    const uploaded = await request(app)
      .post('/api/attachments')
      .set(auth(labSession.token))
      .field('category', 'LAB_REPORT')
      .field('entityId', invoiceId)
      .attach('file', PDF_BYTES, { filename: 'report.pdf', contentType: 'application/pdf' });

    const ownPassword = 'password123';
    const ownUser = await prisma.user.findUniqueOrThrow({ where: { id: patient.id } });
    const ownSession = await loginAs(clinic.slug, ownUser.email, ownPassword);
    const ownDownload = await request(app)
      .get(`/api/attachments/${uploaded.body.id}/download`)
      .set(auth(ownSession.token));
    expect(ownDownload.status).toBe(200);
    expect(Buffer.compare(ownDownload.body, PDF_BYTES)).toBe(0);

    const { user: otherPatient, password: otherPassword } = await createUser(clinic.id, 'PATIENT');
    const otherSession = await loginAs(clinic.slug, otherPatient.email, otherPassword);
    const deniedDownload = await request(app)
      .get(`/api/attachments/${uploaded.body.id}/download`)
      .set(auth(otherSession.token));
    expect(deniedDownload.status).toBe(403);
  });

  it('any staff role can read a LAB_REPORT even if it cannot upload one', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 2 });
    const { labSession, invoiceId } = await setupLabInvoice(clinic.id, clinic.slug);
    const uploaded = await request(app)
      .post('/api/attachments')
      .set(auth(labSession.token))
      .field('category', 'LAB_REPORT')
      .field('entityId', invoiceId)
      .attach('file', PDF_BYTES, { filename: 'report.pdf', contentType: 'application/pdf' });

    const { doctorProfile, user: doctorUser } = await createDoctor(clinic.id, { email: 'doc-attach@test.local' });
    const doctorSession = await loginAs(clinic.slug, doctorUser.email, 'password123');

    const list = await request(app)
      .get('/api/attachments')
      .query({ category: 'LAB_REPORT', entityId: invoiceId })
      .set(auth(doctorSession.token));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const download = await request(app)
      .get(`/api/attachments/${uploaded.body.id}/download`)
      .set(auth(doctorSession.token));
    expect(download.status).toBe(200);
    void doctorProfile;
  });

  it('a PRESCRIPTION_SCAN attaches to a saved consultation; a doctor can upload, a lab tech cannot', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile, user: doctorUser } = await createDoctor(clinic.id, { email: 'doc-scan@test.local' });
    await request(app).put(`/api/admin/doctors/${doctorProfile.id}/schedule`).set(auth(adminToken)).send({
      slots: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: '09:00', endTime: '18:00' })),
    });
    const doctorSession = await loginAs(clinic.slug, doctorUser.email, 'password123');
    const { user: patient, password: patientPassword } = await createUser(clinic.id, 'PATIENT');
    const patientSession = await loginAs(clinic.slug, patient.email, patientPassword);

    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const appt = await request(app)
      .post('/api/appointments')
      .set(auth(patientSession.token))
      .send({ doctorId: doctorProfile.id, date: tomorrow.toISOString().slice(0, 10), startTime: '09:00' });

    const draft = await request(app)
      .put(`/api/consultations/${appt.body.id}`)
      .set(auth(doctorSession.token))
      .send({ diagnosis: 'Draft note' });
    expect(draft.status).toBe(200);

    const uploaded = await request(app)
      .post('/api/attachments')
      .set(auth(doctorSession.token))
      .field('category', 'PRESCRIPTION_SCAN')
      .field('entityId', draft.body.id)
      .attach('file', PDF_BYTES, { filename: 'old-prescription.pdf', contentType: 'application/pdf' });
    expect(uploaded.status).toBe(201);

    const { password: labPassword } = await createLabTech(clinic.id);
    const labSession = await loginAs(clinic.slug, (await prisma.user.findFirst({ where: { clinicId: clinic.id, role: 'LAB_TECHNICIAN' } }))!.email, labPassword);
    const denied = await request(app)
      .post('/api/attachments')
      .set(auth(labSession.token))
      .field('category', 'PRESCRIPTION_SCAN')
      .field('entityId', draft.body.id)
      .attach('file', PDF_BYTES, { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(denied.status).toBe(403);
  });

  it('deleting an attachment (ADMIN only) removes it from disk and the DB', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 2 });
    const { labSession, invoiceId } = await setupLabInvoice(clinic.id, clinic.slug);
    const uploaded = await request(app)
      .post('/api/attachments')
      .set(auth(labSession.token))
      .field('category', 'LAB_REPORT')
      .field('entityId', invoiceId)
      .attach('file', PDF_BYTES, { filename: 'report.pdf', contentType: 'application/pdf' });

    const record = await prisma.attachment.findUniqueOrThrow({ where: { id: uploaded.body.id } });
    const { absolutePathFor } = await import('../src/utils/uploads');
    const diskPath = absolutePathFor(record.storageKey);
    expect(fs.existsSync(diskPath)).toBe(true);

    const deniedDelete = await request(app).delete(`/api/attachments/${uploaded.body.id}`).set(auth(labSession.token));
    expect(deniedDelete.status).toBe(403);

    const del = await request(app).delete(`/api/attachments/${uploaded.body.id}`).set(auth(adminToken));
    expect(del.status).toBe(204);
    expect(fs.existsSync(diskPath)).toBe(false);
    const gone = await prisma.attachment.findUnique({ where: { id: uploaded.body.id } });
    expect(gone).toBeNull();
  });

  it('an upload that fails validation leaves no orphaned file on disk', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 2 });
    const { labSession } = await setupLabInvoice(clinic.id, clinic.slug);

    const { UPLOADS_ROOT } = await import('../src/utils/uploads');
    const clinicDir = `${UPLOADS_ROOT}/${clinic.id}`;
    const before = fs.existsSync(clinicDir) ? fs.readdirSync(clinicDir).length : 0;

    const res = await request(app)
      .post('/api/attachments')
      .set(auth(labSession.token))
      .field('category', 'LAB_REPORT')
      .field('entityId', 'does-not-exist')
      .attach('file', PDF_BYTES, { filename: 'report.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(404);

    const after = fs.existsSync(clinicDir) ? fs.readdirSync(clinicDir).length : 0;
    expect(after).toBe(before);
  });

  it('a Radiology Technician can upload a RADIOLOGY_DICOM .dcm file; the stored mimeType is normalized to application/dicom', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 3 });
    const { radSession, invoiceId } = await setupRadiologyInvoice(clinic.id, clinic.slug);

    const res = await request(app)
      .post('/api/attachments')
      .set(auth(radSession.token))
      // Browsers commonly report application/octet-stream (or nothing) for
      // DICOM, not application/dicom -- send that here to prove acceptance
      // relies on the .dcm extension, not the client-supplied mimetype.
      .field('category', 'RADIOLOGY_DICOM')
      .field('entityId', invoiceId)
      .attach('file', DICOM_BYTES, { filename: 'scan.dcm', contentType: 'application/octet-stream' });
    expect(res.status).toBe(201);
    expect(res.body.category).toBe('RADIOLOGY_DICOM');
    expect(res.body.fileName).toBe('scan.dcm');
    expect(res.body.mimeType).toBe('application/dicom');

    const record = await prisma.attachment.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(record.mimeType).toBe('application/dicom');
    expect(record.storageKey.endsWith('.dcm')).toBe(true);
  });

  it('rejects a non-.dcm file uploaded against RADIOLOGY_DICOM', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 3 });
    const { radSession, invoiceId } = await setupRadiologyInvoice(clinic.id, clinic.slug);

    const res = await request(app)
      .post('/api/attachments')
      .set(auth(radSession.token))
      .field('category', 'RADIOLOGY_DICOM')
      .field('entityId', invoiceId)
      .attach('file', PDF_BYTES, { filename: 'report.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/only a \.dcm dicom file/i);
  });

  it('rejects a .dcm file uploaded against RADIOLOGY_REPORT (DICOM special-casing is category-specific)', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 3 });
    const { radSession, invoiceId } = await setupRadiologyInvoice(clinic.id, clinic.slug);

    const res = await request(app)
      .post('/api/attachments')
      .set(auth(radSession.token))
      .field('category', 'RADIOLOGY_REPORT')
      .field('entityId', invoiceId)
      .attach('file', DICOM_BYTES, { filename: 'scan.dcm', contentType: 'application/octet-stream' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/unsupported file type/i);
  });

  it('a Lab Technician cannot upload a RADIOLOGY_DICOM attachment', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 3 });
    const { invoiceId } = await setupRadiologyInvoice(clinic.id, clinic.slug);
    const { password: labPassword } = await createLabTech(clinic.id);
    const labSession = await loginAs(
      clinic.slug,
      (await prisma.user.findFirst({ where: { clinicId: clinic.id, role: 'LAB_TECHNICIAN' } }))!.email,
      labPassword,
    );

    const res = await request(app)
      .post('/api/attachments')
      .set(auth(labSession.token))
      .field('category', 'RADIOLOGY_DICOM')
      .field('entityId', invoiceId)
      .attach('file', DICOM_BYTES, { filename: 'scan.dcm', contentType: 'application/octet-stream' });
    expect(res.status).toBe(403);
  });

  it('lists RADIOLOGY_DICOM attachments separately from RADIOLOGY_REPORT ones on the same invoice', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 3 });
    const { radSession, invoiceId } = await setupRadiologyInvoice(clinic.id, clinic.slug);

    await request(app)
      .post('/api/attachments')
      .set(auth(radSession.token))
      .field('category', 'RADIOLOGY_DICOM')
      .field('entityId', invoiceId)
      .attach('file', DICOM_BYTES, { filename: 'scan.dcm', contentType: 'application/octet-stream' });
    await request(app)
      .post('/api/attachments')
      .set(auth(radSession.token))
      .field('category', 'RADIOLOGY_REPORT')
      .field('entityId', invoiceId)
      .attach('file', PDF_BYTES, { filename: 'report.pdf', contentType: 'application/pdf' });

    const dicomList = await request(app)
      .get('/api/attachments')
      .query({ category: 'RADIOLOGY_DICOM', entityId: invoiceId })
      .set(auth(radSession.token));
    expect(dicomList.body).toHaveLength(1);
    expect(dicomList.body[0].fileName).toBe('scan.dcm');

    const reportList = await request(app)
      .get('/api/attachments')
      .query({ category: 'RADIOLOGY_REPORT', entityId: invoiceId })
      .set(auth(radSession.token));
    expect(reportList.body).toHaveLength(1);
    expect(reportList.body[0].fileName).toBe('report.pdf');
  });
});
