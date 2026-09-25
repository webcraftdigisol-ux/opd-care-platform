import request from 'supertest';
import {
  app,
  prisma,
  setupClinicWithAdmin,
  createUser,
  createDoctor,
  loginAs,
  auth,
  tomorrowDateStr,
} from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

async function bookAsNewPatient(clinicSlug: string, clinicId: string, doctorId: string, date: string, startTime: string) {
  const { user: patient, password } = await createUser(clinicId, 'PATIENT');
  const session = await loginAs(clinicSlug, patient.email, password);
  const res = await request(app)
    .post('/api/appointments')
    .set(auth(session.token))
    .send({ doctorId, date, startTime });
  return { res, session };
}

describe('Fixed time-slot booking', () => {
  it('GET /doctors/:id/slots returns the full grid for a scheduled day, all available', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);

    const res = await request(app)
      .get(`/api/doctors/${doctorProfile.id}/slots`)
      .query({ date: tomorrowDateStr() })
      .set(auth(adminToken));

    expect(res.status).toBe(200);
    // 09:00-18:00 at 15-minute slots = 36 slots.
    expect(res.body).toHaveLength(36);
    expect(res.body[0]).toEqual({ startTime: '09:00', endTime: '09:15', available: true });
    expect(res.body.every((s: { available: boolean }) => s.available)).toBe(true);
  });

  it('booking a slot sets startTime and removes it from the available list', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const date = tomorrowDateStr();

    const { res } = await bookAsNewPatient(clinic.slug, clinic.id, doctorProfile.id, date, '10:00');
    expect(res.status).toBe(201);
    expect(res.body.startTime).toBe('10:00');

    const slots = await request(app)
      .get(`/api/doctors/${doctorProfile.id}/slots`)
      .query({ date })
      .set(auth(adminToken));
    expect(slots.body.find((s: { startTime: string }) => s.startTime === '10:00').available).toBe(false);
  });

  it('rejects booking the same slot twice', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const date = tomorrowDateStr();

    const first = await bookAsNewPatient(clinic.slug, clinic.id, doctorProfile.id, date, '11:00');
    expect(first.res.status).toBe(201);

    const second = await bookAsNewPatient(clinic.slug, clinic.id, doctorProfile.id, date, '11:00');
    expect(second.res.status).toBe(400);
    expect(second.res.body.message).toMatch(/not available/i);
  });

  it('under a genuine race, exactly one of five concurrent bookings for the same slot wins', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const date = tomorrowDateStr();

    // Log everyone in first, so the five booking requests really do land
    // at the same moment rather than staggered by registration.
    const sessions = [];
    for (let i = 0; i < 5; i++) {
      const { user, password } = await createUser(clinic.id, 'PATIENT');
      sessions.push(await loginAs(clinic.slug, user.email, password));
    }
    const results = await Promise.all(
      sessions.map((s) =>
        request(app).post('/api/appointments').set(auth(s.token)).send({ doctorId: doctorProfile.id, date, startTime: '12:00' }),
      ),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses[0]).toBe(201);
    for (const status of statuses.slice(1)) expect([400, 409]).toContain(status);

    const bookedCount = await prisma.appointment.count({
      where: { doctorId: doctorProfile.id, date: new Date(`${date}T00:00:00.000Z`), startTime: '12:00', status: { not: 'CANCELLED' } },
    });
    expect(bookedCount).toBe(1);
  });

  it('rejects a start time outside the doctor\'s schedule window', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id); // scheduled 09:00-18:00
    const date = tomorrowDateStr();

    const { res } = await bookAsNewPatient(clinic.slug, clinic.id, doctorProfile.id, date, '20:00');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not available/i);
  });

  it('rejects a start time that does not align to the slot grid', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id); // 15-minute slots

    const { res } = await bookAsNewPatient(clinic.slug, clinic.id, doctorProfile.id, tomorrowDateStr(), '09:07');
    expect(res.status).toBe(400);
  });

  it('cancelling an appointment frees its slot for another patient to book', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const date = tomorrowDateStr();

    const { res: booked, session } = await bookAsNewPatient(clinic.slug, clinic.id, doctorProfile.id, date, '13:00');
    expect(booked.status).toBe(201);

    const cancelled = await request(app).post(`/api/appointments/${booked.body.id}/cancel`).set(auth(session.token));
    expect(cancelled.status).toBe(200);

    const rebooked = await bookAsNewPatient(clinic.slug, clinic.id, doctorProfile.id, date, '13:00');
    expect(rebooked.res.status).toBe(201);
  });

  it('a walk-in is not slotted: no startTime required or set', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);

    const res = await request(app)
      .post('/api/appointments/walk-in')
      .set(auth(adminToken))
      .send({ doctorId: doctorProfile.id, patientName: 'Walk-in Patient', patientPhone: '9876500000' });

    expect(res.status).toBe(201);
    expect(res.body.startTime).toBeNull();
    expect(res.body.isWalkIn).toBe(true);
  });

  it('concurrent walk-ins for the same doctor each get their own token', async () => {
    const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        request(app)
          .post('/api/appointments/walk-in')
          .set(auth(adminToken))
          .send({ doctorId: doctorProfile.id, patientName: `Walk-in ${i}`, patientPhone: `91234000${10 + i}` }),
      ),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(results.map((r) => r.body.tokenNumber).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('a cancellation never frees a token number for someone else to share', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const date = tomorrowDateStr();

    const first = await bookAsNewPatient(clinic.slug, clinic.id, doctorProfile.id, date, '09:00');
    const second = await bookAsNewPatient(clinic.slug, clinic.id, doctorProfile.id, date, '09:15');
    const third = await bookAsNewPatient(clinic.slug, clinic.id, doctorProfile.id, date, '09:30');
    expect([first, second, third].map((b) => b.res.body.tokenNumber)).toEqual([1, 2, 3]);

    const cancel = await request(app).post(`/api/appointments/${second.res.body.id}/cancel`).set(auth(second.session.token));
    expect(cancel.status).toBe(200);

    const fourth = await bookAsNewPatient(clinic.slug, clinic.id, doctorProfile.id, date, '09:45');
    expect(fourth.res.body.tokenNumber).toBe(4);
  });
});
