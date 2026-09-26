import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { toAppointment, patientWithCode } from '../utils/serialize';
import { createPatient, normalizePhone, splitName, withPatient } from '../utils/patients';
import { notifyPatientEmail } from '../utils/notify';
import { parseDateOnly } from '../utils/dates';
import { getAvailableSlots } from '../utils/availableSlots';
import { asyncHandler, HttpError } from '../middleware/errorHandler';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth';

export const appointmentsRouter = Router();

appointmentsRouter.use(requireAuth);

type Tx = Prisma.TransactionClient;

// Serializes every booking for one doctor on one day (slot bookings and
// walk-ins alike) for the rest of the transaction, so "is the slot free?" and
// "which token is next?" can't both be answered the same way for two
// concurrent requests. Without it, simultaneous requests all passed the slot
// check and all got the same token. A transaction-scoped Postgres advisory
// lock -- released automatically on commit or rollback -- rather than a
// unique index, because the slot rule only applies to non-cancelled rows and
// Prisma's schema can't express a partial unique index.
async function lockDoctorDay(tx: Tx, doctorId: string, date: Date): Promise<void> {
  const key = `appointments:${doctorId}:${date.toISOString().slice(0, 10)}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

// Highest token issued that day + 1, counting cancelled appointments too, so
// a cancellation never frees a number that a later patient then shares with
// someone still in the queue. Must run under lockDoctorDay.
async function nextTokenNumber(tx: Tx, doctorId: string, date: Date): Promise<number> {
  const { _max } = await tx.appointment.aggregate({ where: { doctorId, date }, _max: { tokenNumber: true } });
  return (_max.tokenNumber ?? 0) + 1;
}

async function assertDoctorInClinic(clinicId: string, doctorId: string, date: Date) {
  const doctor = await prisma.doctorProfile.findFirst({ where: { id: doctorId, user: { clinicId } } });
  if (!doctor) throw new HttpError(404, 'Doctor not found');
  const dayOfWeek = date.getUTCDay();
  const schedule = await prisma.schedule.findFirst({ where: { doctorId, dayOfWeek } });
  if (!schedule) {
    throw new HttpError(400, 'Doctor is not available on the selected day');
  }
  return doctor;
}

const bookSchema = z.object({
  doctorId: z.string().min(1),
  date: z.string().min(1),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time, expected HH:mm'),
  reason: z.string().optional(),
});

appointmentsRouter.post(
  '/',
  requireRole('PATIENT'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = bookSchema.parse(req.body);
    const clinicId = req.auth!.clinicId;
    const date = parseDateOnly(data.date);
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    if (date < startOfToday) {
      throw new HttpError(400, 'Cannot book an appointment in the past');
    }
    const doctor = await assertDoctorInClinic(clinicId, data.doctorId, date);

    // Validated against the exact same slot computation GET /doctors/:id/slots
    // returns to the UI, so "bookable" and "booked" can never drift apart.
    const slots = await getAvailableSlots(data.doctorId, date, doctor.slotMinutes);
    const slot = slots.find((s) => s.startTime === data.startTime);
    if (!slot || !slot.available) {
      throw new HttpError(400, 'That time slot is not available -- please pick another');
    }

    const appointment = await prisma.$transaction(async (tx) => {
      // Re-check under the lock as the actual double-booking guard; the
      // check above only fails fast for a slot that was already taken.
      await lockDoctorDay(tx, data.doctorId, date);
      const conflict = await tx.appointment.findFirst({
        where: { doctorId: data.doctorId, date, startTime: data.startTime, status: { not: 'CANCELLED' } },
      });
      if (conflict) {
        throw new HttpError(409, 'That time slot was just taken -- please pick another');
      }
      const tokenNumber = await nextTokenNumber(tx, data.doctorId, date);
      return tx.appointment.create({
        data: {
          clinicId,
          patientId: req.auth!.userId,
          doctorId: data.doctorId,
          date,
          tokenNumber,
          startTime: data.startTime,
          reason: data.reason,
          consultationFee: doctor.consultationFee,
        },
        include: { patient: patientWithCode, doctor: { include: { user: true } } },
      });
    });

    const booked = withPatient(appointment);
    await notifyPatientEmail({
      clinicId,
      patientId: booked.patientId,
      type: 'APPOINTMENT_CONFIRMED',
      to: booked.patient.email,
      subject: `Appointment confirmed — Token #${appointment.tokenNumber}`,
      body: `Hi ${booked.patient.name}, your appointment with Dr. ${appointment.doctor.user.name} on ${appointment.date.toISOString().slice(0, 10)} at ${appointment.startTime} is confirmed. Your token number is #${appointment.tokenNumber}.`,
    });

    res.status(201).json(toAppointment(appointment));
  }),
);

appointmentsRouter.get(
  '/mine',
  requireRole('PATIENT'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const appointments = await prisma.appointment.findMany({
      where: { clinicId: req.auth!.clinicId, patientId: req.auth!.userId },
      include: {
        doctor: { include: { user: true } },
        consultation: { include: { prescriptions: true, labTestsOrdered: true, radiologyOrdered: true } },
      },
      // startTime asc puts slotted bookings in visit order; Postgres sorts
      // NULLs last on ASC by default, so same-day walk-ins (no startTime)
      // fall after them, broken by booking order via tokenNumber.
      orderBy: [{ date: 'desc' }, { startTime: 'asc' }, { tokenNumber: 'asc' }],
    });
    res.json(appointments.map(toAppointment));
  }),
);

const queueQuerySchema = z.object({
  doctorId: z.string().optional(),
  date: z.string().optional(),
});

appointmentsRouter.get(
  '/queue',
  requireRole('DOCTOR', 'ADMIN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const query = queueQuerySchema.parse(req.query);
    const clinicId = req.auth!.clinicId;
    let doctorId = query.doctorId;
    if (req.auth!.role === 'DOCTOR') {
      const doctor = await prisma.doctorProfile.findUnique({ where: { userId: req.auth!.userId } });
      if (!doctor) throw new HttpError(404, 'Doctor profile not found for this account');
      doctorId = doctor.id;
    }
    if (!doctorId) throw new HttpError(400, 'doctorId is required');
    const date = parseDateOnly(query.date ?? new Date().toISOString().slice(0, 10));

    const appointments = await prisma.appointment.findMany({
      where: { clinicId, doctorId, date },
      include: {
        patient: patientWithCode,
        doctor: { include: { user: true } },
        consultation: { include: { prescriptions: true, labTestsOrdered: true, radiologyOrdered: true } },
      },
      orderBy: [{ startTime: 'asc' }, { tokenNumber: 'asc' }],
    });
    res.json(appointments.map(toAppointment));
  }),
);

const statusSchema = z.object({
  status: z.enum(['BOOKED', 'CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED', 'CANCELLED', 'NO_SHOW']),
});

appointmentsRouter.get(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const appointment = await prisma.appointment.findFirst({
      where: { id: req.params.id, clinicId: req.auth!.clinicId },
      include: {
        patient: patientWithCode,
        doctor: { include: { user: true } },
        consultation: { include: { prescriptions: true, labTestsOrdered: true, radiologyOrdered: true } },
      },
    });
    if (!appointment) throw new HttpError(404, 'Appointment not found');

    if (req.auth!.role === 'PATIENT' && appointment.patientId !== req.auth!.userId) {
      throw new HttpError(403, 'Not your appointment');
    }
    if (req.auth!.role === 'DOCTOR') {
      const doctor = await prisma.doctorProfile.findUnique({ where: { userId: req.auth!.userId } });
      if (!doctor || doctor.id !== appointment.doctorId) {
        throw new HttpError(403, 'Not your appointment');
      }
    }

    res.json(toAppointment(appointment));
  }),
);

appointmentsRouter.patch(
  '/:id/status',
  requireRole('DOCTOR', 'ADMIN', 'RECEPTIONIST'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { status } = statusSchema.parse(req.body);
    const appointment = await prisma.appointment.findFirst({
      where: { id: req.params.id, clinicId: req.auth!.clinicId },
    });
    if (!appointment) throw new HttpError(404, 'Appointment not found');

    if (req.auth!.role === 'DOCTOR') {
      const doctor = await prisma.doctorProfile.findUnique({ where: { userId: req.auth!.userId } });
      if (!doctor || doctor.id !== appointment.doctorId) {
        throw new HttpError(403, 'Not your appointment');
      }
    }
    // Arriving (and anything after) needs a real patient record.
    if (['CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED'].includes(status)) withPatient(appointment);

    const updated = await prisma.appointment.update({
      where: { id: req.params.id },
      data: { status },
      include: {
        patient: patientWithCode,
        doctor: { include: { user: true } },
        consultation: { include: { prescriptions: true, labTestsOrdered: true, radiologyOrdered: true } },
      },
    });
    res.json(toAppointment(updated));
  }),
);

appointmentsRouter.post(
  '/:id/cancel',
  requireRole('PATIENT'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const appointment = await prisma.appointment.findFirst({
      where: { id: req.params.id, clinicId: req.auth!.clinicId },
    });
    if (!appointment) throw new HttpError(404, 'Appointment not found');
    if (appointment.patientId !== req.auth!.userId) throw new HttpError(403, 'Not your appointment');
    if (appointment.status !== 'BOOKED') {
      throw new HttpError(400, 'Only a booked appointment can be cancelled');
    }
    const updated = await prisma.appointment.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' },
      include: { patient: patientWithCode, doctor: { include: { user: true } } },
    });
    res.json(toAppointment(updated));
  }),
);

const withDetails = {
  patient: patientWithCode,
  doctor: { include: { user: true } },
  consultation: { include: { prescriptions: true, labTestsOrdered: true, radiologyOrdered: true } },
} as const;

const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:mm');

// The Appointments page's day list: every booking and visit that day,
// optionally for one doctor. A doctor sees their own unless they ask for
// another doctor's.
appointmentsRouter.get(
  '/',
  requireRole('ADMIN', 'RECEPTIONIST', 'DOCTOR'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const query = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), doctorId: z.string().optional() }).parse(req.query);
    const appointments = await prisma.appointment.findMany({
      where: { clinicId: req.auth!.clinicId, date: parseDateOnly(query.date), ...(query.doctorId ? { doctorId: query.doctorId } : {}) },
      include: withDetails,
      // Timed bookings in time order first, then the rest by token.
      orderBy: [{ startTime: 'asc' }, { tokenNumber: 'asc' }],
    });
    res.json(appointments.map(toAppointment));
  }),
);

const scheduleSchema = z
  .object({
    doctorId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: TIME.nullish(),
    reason: z.string().trim().max(500).optional(),
    patientId: z.string().min(1).optional(),
    guestName: z.string().trim().min(2).max(100).optional(),
    guestPhone: z.string().trim().min(6).max(20).optional(),
  })
  .refine((d) => d.patientId || d.guestName, { message: 'Pick a patient, or give the name of the person to book for' });

async function assertCanUseDoctor(req: AuthedRequest, doctorId: string) {
  const doctor = await prisma.doctorProfile.findFirst({ where: { id: doctorId, user: { clinicId: req.auth!.clinicId } } });
  if (!doctor) throw new HttpError(404, 'Doctor not found');
  if (req.auth!.role === 'DOCTOR' && doctor.userId !== req.auth!.userId) {
    throw new HttpError(403, 'A doctor can only book their own appointments');
  }
  return doctor;
}

function assertNotPast(date: Date) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  // A day's grace: the clinic's "today" (IST) can be yesterday in UTC.
  today.setUTCDate(today.getUTCDate() - 1);
  if (date < today) throw new HttpError(400, 'Cannot book an appointment in the past');
}

// Staff booking: any day, an optional time (no slot grid -- the desk
// knows the doctor's day), a registered patient or a name for a phone
// booking. Gets the doctor's next token for that day, like every visit.
appointmentsRouter.post(
  '/schedule',
  requireRole('ADMIN', 'RECEPTIONIST', 'DOCTOR'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = scheduleSchema.parse(req.body);
    const clinicId = req.auth!.clinicId;
    const date = parseDateOnly(data.date);
    assertNotPast(date);
    const doctor = await assertCanUseDoctor(req, data.doctorId);
    if (data.patientId) {
      const patient = await prisma.user.findFirst({ where: { id: data.patientId, clinicId, role: 'PATIENT' } });
      if (!patient) throw new HttpError(404, 'Patient not found');
    }

    const appointment = await prisma.$transaction(async (tx) => {
      await lockDoctorDay(tx, doctor.id, date);
      const tokenNumber = await nextTokenNumber(tx, doctor.id, date);
      return tx.appointment.create({
        data: {
          clinicId,
          doctorId: doctor.id,
          date,
          tokenNumber,
          startTime: data.time ?? null,
          reason: data.reason || null,
          consultationFee: doctor.consultationFee,
          ...(data.patientId
            ? { patientId: data.patientId }
            : { guestName: data.guestName!, guestPhone: data.guestPhone ? normalizePhone(data.guestPhone) : null }),
        },
        include: withDetails,
      });
    });

    if (appointment.patient) {
      await notifyPatientEmail({
        clinicId,
        patientId: appointment.patient.id,
        type: 'APPOINTMENT_CONFIRMED',
        to: appointment.patient.email,
        subject: `Appointment confirmed — Token #${appointment.tokenNumber}`,
        body: `Hi ${appointment.patient.name}, your appointment with Dr. ${appointment.doctor.user.name} on ${data.date}${
          data.time ? ` at ${data.time}` : ''
        } is confirmed. Your token number is #${appointment.tokenNumber}.`,
      });
    }
    res.status(201).json(toAppointment(appointment));
  }),
);

const rescheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: TIME.nullish(),
  doctorId: z.string().min(1).optional(),
  reason: z.string().trim().max(500).nullish(),
});

// Move a booking to another day, time or doctor. Only while it's still a
// booking; a new day or doctor means a new token in that queue, and a new
// doctor brings their own fee.
appointmentsRouter.patch(
  '/:id',
  requireRole('ADMIN', 'RECEPTIONIST', 'DOCTOR'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = rescheduleSchema.parse(req.body);
    const existing = await prisma.appointment.findFirst({ where: { id: req.params.id, clinicId: req.auth!.clinicId } });
    if (!existing) throw new HttpError(404, 'Appointment not found');
    await assertCanUseDoctor(req, existing.doctorId);
    if (existing.status !== 'BOOKED') throw new HttpError(400, 'Only a booked appointment can be rescheduled');

    const doctor = data.doctorId ? await assertCanUseDoctor(req, data.doctorId) : null;
    const date = data.date ? parseDateOnly(data.date) : existing.date;
    if (data.date) assertNotPast(date);
    const doctorId = doctor?.id ?? existing.doctorId;
    const moved = doctorId !== existing.doctorId || date.getTime() !== existing.date.getTime();

    const updated = await prisma.$transaction(async (tx) => {
      let tokenNumber = existing.tokenNumber;
      if (moved) {
        await lockDoctorDay(tx, doctorId, date);
        tokenNumber = await nextTokenNumber(tx, doctorId, date);
      }
      return tx.appointment.update({
        where: { id: existing.id },
        data: {
          date,
          doctorId,
          tokenNumber,
          ...(data.time !== undefined ? { startTime: data.time } : {}),
          ...(data.reason !== undefined ? { reason: data.reason || null } : {}),
          ...(doctor ? { consultationFee: doctor.consultationFee } : {}),
          // Remind again for the new day.
          ...(moved ? { reminderSentAt: null } : {}),
        },
        include: withDetails,
      });
    });
    res.json(toAppointment(updated));
  }),
);

const registerBookingSchema = z.object({
  patientId: z.string().min(1).optional(),
  name: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().min(6).max(20).optional(),
  checkIn: z.boolean().optional(),
});

// On arrival, a booking made for someone not registered yet becomes a real
// patient: either a registered one the desk picked (e.g. a family member
// found by mobile) or a new registration from the booking's name and
// mobile. Optionally checks them in at the same time.
appointmentsRouter.post(
  '/:id/register',
  requireRole('ADMIN', 'RECEPTIONIST'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = registerBookingSchema.parse(req.body);
    const clinicId = req.auth!.clinicId;
    const booking = await prisma.appointment.findFirst({ where: { id: req.params.id, clinicId } });
    if (!booking) throw new HttpError(404, 'Appointment not found');
    if (booking.patientId) throw new HttpError(400, 'This booking already belongs to a registered patient');
    if (['CANCELLED', 'NO_SHOW'].includes(booking.status)) throw new HttpError(400, 'This booking was cancelled or missed');

    let patientId = data.patientId;
    if (patientId) {
      const patient = await prisma.user.findFirst({ where: { id: patientId, clinicId, role: 'PATIENT' } });
      if (!patient) throw new HttpError(404, 'Patient not found');
    }
    const updated = await prisma.$transaction(async (tx) => {
      if (!patientId) {
        const phone = data.phone ?? booking.guestPhone;
        if (!phone) throw new HttpError(400, 'A mobile number is needed to register the patient');
        const { user } = await createPatient(tx, clinicId, { ...splitName(data.name ?? booking.guestName ?? ''), phone });
        patientId = user.id;
      }
      return tx.appointment.update({
        where: { id: booking.id },
        data: { patientId, guestName: null, guestPhone: null, ...(data.checkIn ? { status: 'CHECKED_IN' } : {}) },
        include: withDetails,
      });
    });
    res.json(toAppointment(updated));
  }),
);

const startVisitSchema = z.object({
  patientId: z.string().min(1),
  doctorId: z.string().min(1).optional(),
  reason: z.string().optional(),
});

// A consultation straight from the patient's profile (a quick review, a
// patient seen without a token first): today's visit is created already in
// consultation, with the next token and the doctor's fee. No schedule
// check -- the doctor is seeing the patient right now.
appointmentsRouter.post(
  '/visit',
  requireRole('DOCTOR', 'ADMIN'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = startVisitSchema.parse(req.body);
    const clinicId = req.auth!.clinicId;
    let doctor;
    if (req.auth!.role === 'DOCTOR') {
      doctor = await prisma.doctorProfile.findUnique({ where: { userId: req.auth!.userId } });
      if (!doctor) throw new HttpError(400, 'Your doctor profile is missing');
      if (data.doctorId && data.doctorId !== doctor.id) throw new HttpError(403, 'A doctor can only start their own visits');
    } else {
      if (!data.doctorId) throw new HttpError(400, 'Choose the doctor for this visit');
      doctor = await prisma.doctorProfile.findFirst({ where: { id: data.doctorId, user: { clinicId } } });
      if (!doctor) throw new HttpError(404, 'Doctor not found');
    }
    const patient = await prisma.user.findFirst({ where: { id: data.patientId, clinicId, role: 'PATIENT' } });
    if (!patient) throw new HttpError(404, 'Patient not found');

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const appointment = await prisma.$transaction(async (tx) => {
      await lockDoctorDay(tx, doctor.id, today);
      const tokenNumber = await nextTokenNumber(tx, doctor.id, today);
      return tx.appointment.create({
        data: {
          clinicId,
          patientId: patient.id,
          doctorId: doctor.id,
          date: today,
          tokenNumber,
          reason: data.reason,
          isWalkIn: true,
          status: 'IN_CONSULTATION',
          consultationFee: doctor.consultationFee,
        },
        include: { patient: patientWithCode, doctor: { include: { user: true } } },
      });
    });
    res.status(201).json(toAppointment(appointment));
  }),
);

const walkInSchema = z
  .object({
    doctorId: z.string().min(1),
    patientId: z.string().min(1).optional(),
    patientName: z.string().trim().min(2).optional(),
    patientPhone: z.string().trim().min(6).optional(),
    reason: z.string().optional(),
    whatsappOptIn: z.boolean().optional(),
  })
  .refine((d) => d.patientId || (d.patientName && d.patientPhone), {
    message: 'Pick a registered patient, or give a name and mobile number to register a new one',
  });

appointmentsRouter.post(
  '/walk-in',
  requireRole('ADMIN', 'RECEPTIONIST'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const data = walkInSchema.parse(req.body);
    const clinicId = req.auth!.clinicId;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const doctor = await assertDoctorInClinic(clinicId, data.doctorId, today);

    // The front desk recording the patient's in-person WhatsApp consent --
    // Meta accepts consent collected offline as long as it's recorded, and
    // this keeps who recorded it and when. Only ever turns consent on;
    // leaving the box unticked never revokes an earlier opt-in.
    const consent = data.whatsappOptIn
      ? { whatsappOptIn: true, whatsappOptInAt: new Date(), whatsappOptInRecordedById: req.auth!.userId }
      : {};

    // An existing patient is picked explicitly (from the search). A phone
    // number alone never picks one: family members share mobiles, so
    // matching on it would book the visit on someone else's record.
    let patient;
    if (data.patientId) {
      patient = await prisma.user.findFirst({ where: { id: data.patientId, clinicId, role: 'PATIENT' } });
      if (!patient) throw new HttpError(404, 'Patient not found');
      if (data.whatsappOptIn && !patient.whatsappOptIn) {
        patient = await prisma.user.update({ where: { id: patient.id }, data: consent });
      }
    } else {
      ({ user: patient } = await prisma.$transaction((tx) =>
        createPatient(
          tx,
          clinicId,
          { ...splitName(data.patientName!), phone: data.patientPhone!, whatsappOptIn: data.whatsappOptIn },
          { consentRecordedById: req.auth!.userId },
        ),
      ));
    }

    const appointment = await prisma.$transaction(async (tx) => {
      await lockDoctorDay(tx, data.doctorId, today);
      const tokenNumber = await nextTokenNumber(tx, data.doctorId, today);
      return tx.appointment.create({
        data: {
          clinicId,
          patientId: patient!.id,
          doctorId: data.doctorId,
          date: today,
          tokenNumber,
          reason: data.reason,
          isWalkIn: true,
          status: 'CHECKED_IN',
          consultationFee: doctor.consultationFee,
        },
        include: { patient: patientWithCode, doctor: { include: { user: true } } },
      });
    });

    // Walk-ins are usually registered by phone only (with a placeholder
    // @opd.local email), so this correctly ends up SKIPPED for most of them
    // -- notifyPatientEmail filters that placeholder out rather than
    // sending to it.
    const booked = withPatient(appointment);
    await notifyPatientEmail({
      clinicId,
      patientId: booked.patientId,
      type: 'APPOINTMENT_CONFIRMED',
      to: booked.patient.email,
      subject: `Appointment confirmed — Token #${appointment.tokenNumber}`,
      body: `Hi ${booked.patient.name}, you're checked in with Dr. ${appointment.doctor.user.name}. Your token number is #${appointment.tokenNumber}.`,
    });

    res.status(201).json(toAppointment(appointment));
  }),
);
