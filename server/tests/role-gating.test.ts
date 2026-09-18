import request from 'supertest';
import { app, prisma, setupClinicWithAdmin, createUser, createDoctor, uniqueEmail, loginAs, auth } from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

async function setupTier3Clinic() {
  const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 3, taxPercent: 5 });
  const { user: patient } = await createUser(clinic.id, 'PATIENT');
  const { doctorProfile } = await createDoctor(clinic.id);

  const ward = await prisma.ward.create({ data: { clinicId: clinic.id, name: 'General Ward' } });
  const bed = await prisma.bed.create({ data: { wardId: ward.id, label: 'G-1', dailyRate: 1000 } });
  const bed2 = await prisma.bed.create({ data: { wardId: ward.id, label: 'G-2', dailyRate: 1000 } });

  const admission = await request(app)
    .post('/api/ipd/admissions')
    .set(auth(adminToken))
    .send({ patientId: patient.id, bedId: bed.id, admittingDoctorId: doctorProfile.id, depositAmount: 1000 })
    .expect(201);

  return { clinic, adminToken, patient, doctorProfile, bed, bed2, admissionId: admission.body.id };
}

async function loginRole(clinicSlug: string, clinicId: string, role: any) {
  const email = uniqueEmail(role.toLowerCase());
  const { password } = await createUser(clinicId, role, { email });
  const session = await loginAs(clinicSlug, email, password);
  return session.token as string;
}

describe('role gating: Receptionist', () => {
  it('can register a walk-in and view today\'s appointments, but nothing admin-only', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const recepToken = await loginRole(clinic.slug, clinic.id, 'RECEPTIONIST');

    const walkIn = await request(app)
      .post('/api/appointments/walk-in')
      .set(auth(recepToken))
      .send({ doctorId: doctorProfile.id, patientName: 'Walk-in Patient', patientPhone: '9000000001' });
    expect(walkIn.status).toBe(201);

    expect((await request(app).get('/api/admin/appointments').set(auth(recepToken))).status).toBe(200);
    expect((await request(app).post('/api/admin/doctors').set(auth(recepToken)).send({})).status).toBe(403);
    expect((await request(app).get('/api/admin/staff').set(auth(recepToken))).status).toBe(403);
  });

  it('cannot view a patient\'s clinical records (privacy boundary)', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { user: patient } = await createUser(clinic.id, 'PATIENT');
    const recepToken = await loginRole(clinic.slug, clinic.id, 'RECEPTIONIST');

    const res = await request(app).get(`/api/patients/${patient.id}/records`).set(auth(recepToken));
    expect(res.status).toBe(403);
  });
});

describe('role gating: Nurse', () => {
  it('can log vitals and medications, but not admit/discharge/transfer/see billing', async () => {
    const { clinic, patient, doctorProfile, bed2, admissionId } = await setupTier3Clinic();
    const nurseToken = await loginRole(clinic.slug, clinic.id, 'NURSE');

    expect(
      (await request(app).post(`/api/ipd/admissions/${admissionId}/vitals`).set(auth(nurseToken)).send({ pulse: 80 }))
        .status,
    ).toBe(201);

    expect(
      (
        await request(app)
          .post(`/api/ipd/admissions/${admissionId}/medications`)
          .set(auth(nurseToken))
          .send({ medicine: 'Paracetamol', dosage: '500mg', quantity: 1, unitPrice: 2, source: 'CLINIC_SUPPLIED' })
      ).status,
    ).toBe(201);

    expect((await request(app).get('/api/ipd/admissions').set(auth(nurseToken))).status).toBe(200);
    expect((await request(app).get(`/api/patients/${patient.id}/records`).set(auth(nurseToken))).status).toBe(200);

    expect(
      (await request(app).post(`/api/ipd/admissions/${admissionId}/transfer`).set(auth(nurseToken)).send({ toBedId: bed2.id }))
        .status,
    ).toBe(403);
    expect((await request(app).get(`/api/ipd/admissions/${admissionId}/bill-preview`).set(auth(nurseToken))).status).toBe(403);
    expect((await request(app).post(`/api/ipd/admissions/${admissionId}/discharge`).set(auth(nurseToken)).send({})).status).toBe(
      403,
    );
    expect(
      (
        await request(app)
          .post(`/api/ipd/admissions/${admissionId}/doctor-visits`)
          .set(auth(nurseToken))
          .send({ doctorId: doctorProfile.id })
      ).status,
    ).toBe(403);
  });
});

describe('role gating: Head Nurse', () => {
  it('can transfer beds and view billing read-only, but still cannot admit', async () => {
    const { clinic, patient, doctorProfile, bed2, admissionId } = await setupTier3Clinic();
    const headNurseToken = await loginRole(clinic.slug, clinic.id, 'HEAD_NURSE');

    expect(
      (await request(app).post(`/api/ipd/admissions/${admissionId}/transfer`).set(auth(headNurseToken)).send({ toBedId: bed2.id }))
        .status,
    ).toBe(200);
    expect((await request(app).get(`/api/ipd/admissions/${admissionId}/bill-preview`).set(auth(headNurseToken))).status).toBe(
      200,
    );
    expect(
      (
        await request(app)
          .post('/api/ipd/admissions')
          .set(auth(headNurseToken))
          .send({ patientId: patient.id, bedId: bed2.id, admittingDoctorId: doctorProfile.id })
      ).status,
    ).toBe(403);
  });
});

describe('role gating: cross-counter isolation', () => {
  it('a Pharmacist cannot touch Lab or Radiology counter routes, and vice versa', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 2 });
    const { user: patient } = await createUser(clinic.id, 'PATIENT');
    const pharmacistToken = await loginRole(clinic.slug, clinic.id, 'PHARMACIST');
    const labTechToken = await loginRole(clinic.slug, clinic.id, 'LAB_TECHNICIAN');

    expect(
      (await request(app).get(`/api/lab/patients/${patient.id}/pending`).set(auth(pharmacistToken))).status,
    ).toBe(403);
    expect(
      (await request(app).get(`/api/pharmacy/patients/${patient.id}/pending`).set(auth(labTechToken))).status,
    ).toBe(403);
    expect(
      (await request(app).get(`/api/radiology/patients/${patient.id}/pending`).set(auth(pharmacistToken))).status,
    ).toBe(403);
  });
});
