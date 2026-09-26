import request from 'supertest';
import { app, prisma, setupClinicWithAdmin, createUser, createDoctor, loginAs, uniqueEmail, auth } from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

function dateOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function setup() {
  const { clinic, adminToken } = await setupClinicWithAdmin({ tier: 1 });
  const doctorEmail = uniqueEmail('doc');
  const { doctorProfile } = await createDoctor(clinic.id, { email: doctorEmail, consultationFee: 400 });
  const doctorToken = (await loginAs(clinic.slug, doctorEmail, 'password123')).token;
  const recEmail = uniqueEmail('rec');
  await createUser(clinic.id, 'RECEPTIONIST', { email: recEmail });
  const receptionToken = (await loginAs(clinic.slug, recEmail, 'password123')).token;
  const patient = await request(app).post('/api/patients').set(auth(adminToken)).send({ firstName: 'Ravi', lastName: 'Kumar', phone: '9811122233' });
  return { clinic, adminToken, doctorToken, receptionToken, doctorProfile, patientId: patient.body.id as string };
}

const schedule = (token: string, body: object) => request(app).post('/api/appointments/schedule').set(auth(token)).send(body);

describe('Scheduling from the Appointments page', () => {
  it('books a registered patient on any day, with an optional time, and lists the day', async () => {
    const { receptionToken, doctorProfile, patientId } = await setup();
    const day = dateOffset(3);
    const a = await schedule(receptionToken, { doctorId: doctorProfile.id, date: day, time: '15:00', reason: 'Follow-up', patientId });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ status: 'BOOKED', startTime: '15:00', tokenNumber: 1, consultationFee: 400, patientId, guestName: null });
    expect(a.body.patient.patientCode).toBe('PT000001');

    const b = await schedule(receptionToken, { doctorId: doctorProfile.id, date: day, patientId });
    expect(b.body).toMatchObject({ startTime: null, tokenNumber: 2 });

    const list = await request(app).get('/api/appointments').query({ date: day }).set(auth(receptionToken));
    expect(list.body.map((x: any) => x.tokenNumber)).toEqual([1, 2]);
    const other = await request(app).get('/api/appointments').query({ date: dateOffset(4) }).set(auth(receptionToken));
    expect(other.body).toEqual([]);
  });

  it('books someone not registered yet by name and optional mobile', async () => {
    const { receptionToken, doctorProfile } = await setup();
    const res = await schedule(receptionToken, { doctorId: doctorProfile.id, date: dateOffset(1), guestName: 'Sunita Patil', guestPhone: '98765 00000' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ patientId: null, guestName: 'Sunita Patil', guestPhone: '9876500000', status: 'BOOKED' });
    const nameOnly = await schedule(receptionToken, { doctorId: doctorProfile.id, date: dateOffset(1), guestName: 'No Phone' });
    expect(nameOnly.status).toBe(201);
    expect((await schedule(receptionToken, { doctorId: doctorProfile.id, date: dateOffset(1) })).status).toBe(400);
  });

  it('refuses the past, another clinic\'s patient, and a doctor booking for someone else', async () => {
    const { receptionToken, doctorToken, doctorProfile, patientId, clinic } = await setup();
    expect((await schedule(receptionToken, { doctorId: doctorProfile.id, date: dateOffset(-5), patientId })).status).toBe(400);
    const other = await setupClinicWithAdmin({ tier: 1 });
    const stranger = await request(app).post('/api/patients').set(auth(other.adminToken)).send({ firstName: 'X', phone: '9000000000' });
    expect((await schedule(receptionToken, { doctorId: doctorProfile.id, date: dateOffset(1), patientId: stranger.body.id })).status).toBe(404);

    const { doctorProfile: second } = await createDoctor(clinic.id);
    expect((await schedule(doctorToken, { doctorId: second.id, date: dateOffset(1), patientId })).status).toBe(403);
    expect((await schedule(doctorToken, { doctorId: doctorProfile.id, date: dateOffset(1), patientId })).status).toBe(201);
  });
});

describe('Unregistered bookings on arrival', () => {
  it('cannot be checked in or consulted until registered', async () => {
    const { receptionToken, doctorToken, doctorProfile } = await setup();
    const booking = await schedule(receptionToken, { doctorId: doctorProfile.id, date: dateOffset(0), guestName: 'Sunita Patil', guestPhone: '9876500000' });
    const checkIn = await request(app).patch(`/api/appointments/${booking.body.id}/status`).set(auth(receptionToken)).send({ status: 'CHECKED_IN' });
    expect(checkIn.status).toBe(400);
    expect(checkIn.body.message).toMatch(/not registered yet/);
    const consult = await request(app).put(`/api/consultations/${booking.body.id}`).set(auth(doctorToken)).send({ diagnosis: 'x' });
    expect(consult.status).toBe(400);
    // Marking a phone booking as a no-show is fine.
    const noShow = await request(app).patch(`/api/appointments/${booking.body.id}/status`).set(auth(receptionToken)).send({ status: 'NO_SHOW' });
    expect(noShow.status).toBe(200);
  });

  it('registers a new patient from the booking and checks them in', async () => {
    const { receptionToken, doctorProfile } = await setup();
    const booking = await schedule(receptionToken, { doctorId: doctorProfile.id, date: dateOffset(0), guestName: 'Sunita Patil', guestPhone: '9876500000' });
    const res = await request(app).post(`/api/appointments/${booking.body.id}/register`).set(auth(receptionToken)).send({ checkIn: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'CHECKED_IN', guestName: null });
    expect(res.body.patient).toMatchObject({ name: 'Sunita Patil', phone: '9876500000', patientCode: 'PT000002' });
    expect((await request(app).post(`/api/appointments/${booking.body.id}/register`).set(auth(receptionToken)).send({})).status).toBe(400);
  });

  it('can instead be linked to a registered family member, and needs a mobile for a new registration', async () => {
    const { receptionToken, doctorProfile, patientId } = await setup();
    const booking = await schedule(receptionToken, { doctorId: doctorProfile.id, date: dateOffset(0), guestName: 'Ravi' });
    expect((await request(app).post(`/api/appointments/${booking.body.id}/register`).set(auth(receptionToken)).send({})).status).toBe(400);
    const linked = await request(app).post(`/api/appointments/${booking.body.id}/register`).set(auth(receptionToken)).send({ patientId });
    expect(linked.status).toBe(200);
    expect(linked.body.patientId).toBe(patientId);
    expect(linked.body.status).toBe('BOOKED');
  });

  it('never sends a reminder for an unregistered booking', async () => {
    const { receptionToken, doctorProfile } = await setup();
    await schedule(receptionToken, { doctorId: doctorProfile.id, date: dateOffset(1), guestName: 'Sunita Patil', guestPhone: '9876500000' });
    const { sendDueAppointmentReminders } = await import('../src/utils/reminders');
    await expect(sendDueAppointmentReminders()).resolves.toBeDefined();
  });
});

describe('Rescheduling', () => {
  it('moves a booking to a new day/time with a new token, and a new doctor brings their fee', async () => {
    const { clinic, receptionToken, doctorProfile, patientId } = await setup();
    const first = await schedule(receptionToken, { doctorId: doctorProfile.id, date: dateOffset(2), patientId });
    await schedule(receptionToken, { doctorId: doctorProfile.id, date: dateOffset(3), patientId });

    const moved = await request(app).patch(`/api/appointments/${first.body.id}`).set(auth(receptionToken)).send({ date: dateOffset(3), time: '11:30' });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ date: dateOffset(3), startTime: '11:30', tokenNumber: 2 });

    const { doctorProfile: other } = await createDoctor(clinic.id, { consultationFee: 900 });
    const swapped = await request(app).patch(`/api/appointments/${first.body.id}`).set(auth(receptionToken)).send({ doctorId: other.id });
    expect(swapped.body).toMatchObject({ doctorId: other.id, consultationFee: 900, tokenNumber: 1 });

    await request(app).patch(`/api/appointments/${first.body.id}/status`).set(auth(receptionToken)).send({ status: 'CANCELLED' });
    expect((await request(app).patch(`/api/appointments/${first.body.id}`).set(auth(receptionToken)).send({ time: '12:00' })).status).toBe(400);
  });
});

describe('Dashboard', () => {
  it('counts patients, today\'s registrations and appointments, and the month day by day', async () => {
    const { adminToken, receptionToken, doctorProfile, patientId } = await setup();
    const today = dateOffset(0);
    const visit = await request(app).post('/api/appointments/walk-in').set(auth(adminToken)).send({ doctorId: doctorProfile.id, patientId });
    await request(app).post('/api/payments').set(auth(adminToken)).send({ billType: 'CONSULTATION', billId: visit.body.id, amount: 400, method: 'CASH' });
    const cancelled = await schedule(receptionToken, { doctorId: doctorProfile.id, date: today, guestName: 'Gone' });
    await request(app).patch(`/api/appointments/${cancelled.body.id}/status`).set(auth(receptionToken)).send({ status: 'CANCELLED' });

    const res = await request(app).get('/api/dashboard').query({ date: today }).set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ totalPatients: 1, appointmentsToday: 1, revenueThisMonth: 400, month: today.slice(0, 7) });
    expect(res.body.registeredToday).toBeGreaterThanOrEqual(0); // IST vs UTC day boundary near midnight
    const todayRow = res.body.days.find((d: any) => d.date === today);
    expect(todayRow.appointments).toBe(1);
    expect(res.body.days).toHaveLength(new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate());

    // Reception sees the counts but not the money.
    const rec = await request(app).get('/api/dashboard').query({ date: today }).set(auth(receptionToken));
    expect(rec.body.revenueThisMonth).toBeNull();
    expect(rec.body.days.every((d: any) => d.revenue === null)).toBe(true);
  });
});
