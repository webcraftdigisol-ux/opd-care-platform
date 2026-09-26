import { prisma, setupClinicWithAdmin, createUser, createDoctor } from './helpers';
import { sendDueAppointmentReminders, sendDueFollowUpReminders } from '../src/utils/reminders';

afterAll(async () => {
  await prisma.$disconnect();
});

function dateOnlyOffsetFromToday(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

async function createAppointment(
  clinicId: string,
  patientId: string,
  doctorId: string,
  opts: { date: Date; status?: 'BOOKED' | 'CANCELLED' | 'COMPLETED'; isWalkIn?: boolean; reminderSentAt?: Date },
) {
  return prisma.appointment.create({
    data: {
      clinicId,
      patientId,
      doctorId,
      date: opts.date,
      tokenNumber: 1,
      status: opts.status ?? 'BOOKED',
      isWalkIn: opts.isWalkIn ?? false,
      reminderSentAt: opts.reminderSentAt,
    },
  });
}

async function reminderNotificationFor(clinicId: string, patientId: string, channel?: 'EMAIL' | 'WHATSAPP') {
  return prisma.notification.findFirst({
    where: { clinicId, patientId, type: 'APPOINTMENT_REMINDER', ...(channel ? { channel } : {}) },
  });
}

describe('Scheduled appointment reminders (sendDueAppointmentReminders)', () => {
  it('sends an email reminder for a BOOKED, non-walk-in appointment dated tomorrow', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const { user: patient } = await createUser(clinic.id, 'PATIENT');
    const appt = await createAppointment(clinic.id, patient.id, doctorProfile.id, { date: dateOnlyOffsetFromToday(1) });

    await sendDueAppointmentReminders();

    const notification = await reminderNotificationFor(clinic.id, patient.id, 'EMAIL');
    expect(notification).not.toBeNull();
    expect(notification!.recipient).toBe(patient.email);
    // server/.env.test has no SMTP_* configured, so the send itself is
    // SKIPPED -- the same expected, auditable outcome as every other
    // notification trigger tested in notifications.test.ts.
    expect(notification!.status).toBe('SKIPPED');

    const refetched = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } });
    expect(refetched.reminderSentAt).not.toBeNull();
  });

  it('also attempts a WhatsApp reminder alongside email -- SKIPPED (not a failure) when the patient has not opted in', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const { user: patient } = await createUser(clinic.id, 'PATIENT', { phone: '+919876500001' });
    await createAppointment(clinic.id, patient.id, doctorProfile.id, { date: dateOnlyOffsetFromToday(1) });

    await sendDueAppointmentReminders();

    const notification = await reminderNotificationFor(clinic.id, patient.id, 'WHATSAPP');
    expect(notification).not.toBeNull();
    expect(notification!.status).toBe('SKIPPED');
    expect(notification!.error).toMatch(/not opted in/i);
  });

  it('sends a WhatsApp reminder (via the stub adapter) once the patient has opted in and has a phone number', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const { user: patient } = await createUser(clinic.id, 'PATIENT', { phone: '+919876500002' });
    await prisma.user.update({ where: { id: patient.id }, data: { whatsappOptIn: true } });
    await createAppointment(clinic.id, patient.id, doctorProfile.id, { date: dateOnlyOffsetFromToday(1) });

    await sendDueAppointmentReminders();

    const notification = await reminderNotificationFor(clinic.id, patient.id, 'WHATSAPP');
    expect(notification).not.toBeNull();
    expect(notification!.recipient).toBe('+919876500002');
    // No real Twilio/Meta credentials in this environment -- the stub
    // adapter is what's in effect, which still counts as a real SENT
    // outcome with a (fake) providerMessageId, same as the design intends
    // once real credentials are configured.
    expect(notification!.status).toBe('SENT');
    expect(notification!.providerMessageId).toMatch(/^stub-/);
  });

  it('is idempotent: a second pass does not send a duplicate reminder on either channel', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const { user: patient } = await createUser(clinic.id, 'PATIENT');
    await createAppointment(clinic.id, patient.id, doctorProfile.id, { date: dateOnlyOffsetFromToday(1) });

    await sendDueAppointmentReminders();
    // One attempt per channel (EMAIL + WHATSAPP), even though the WhatsApp
    // one is SKIPPED for a non-opted-in patient -- an attempted-and-logged
    // SKIP still counts as "handled", the same as every other notification
    // trigger in this app.
    const afterFirst = await prisma.notification.count({ where: { clinicId: clinic.id, patientId: patient.id, type: 'APPOINTMENT_REMINDER' } });
    expect(afterFirst).toBe(2);

    await sendDueAppointmentReminders();
    const afterSecond = await prisma.notification.count({ where: { clinicId: clinic.id, patientId: patient.id, type: 'APPOINTMENT_REMINDER' } });
    expect(afterSecond).toBe(2);
  });

  it('skips an appointment that has already been reminded (reminderSentAt already set)', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const { user: patient } = await createUser(clinic.id, 'PATIENT');
    await createAppointment(clinic.id, patient.id, doctorProfile.id, {
      date: dateOnlyOffsetFromToday(1),
      reminderSentAt: new Date(),
    });

    await sendDueAppointmentReminders();
    expect(await reminderNotificationFor(clinic.id, patient.id)).toBeNull();
  });

  it('skips a cancelled appointment', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const { user: patient } = await createUser(clinic.id, 'PATIENT');
    await createAppointment(clinic.id, patient.id, doctorProfile.id, { date: dateOnlyOffsetFromToday(1), status: 'CANCELLED' });

    await sendDueAppointmentReminders();
    expect(await reminderNotificationFor(clinic.id, patient.id)).toBeNull();
  });

  it('skips a walk-in appointment', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const { user: patient } = await createUser(clinic.id, 'PATIENT');
    await createAppointment(clinic.id, patient.id, doctorProfile.id, { date: dateOnlyOffsetFromToday(1), isWalkIn: true });

    await sendDueAppointmentReminders();
    expect(await reminderNotificationFor(clinic.id, patient.id)).toBeNull();
  });

  it('only reminds for tomorrow -- not today, and not the day after', async () => {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const { user: todayPatient } = await createUser(clinic.id, 'PATIENT');
    const { user: laterPatient } = await createUser(clinic.id, 'PATIENT');
    await createAppointment(clinic.id, todayPatient.id, doctorProfile.id, { date: dateOnlyOffsetFromToday(0) });
    await createAppointment(clinic.id, laterPatient.id, doctorProfile.id, { date: dateOnlyOffsetFromToday(2) });

    await sendDueAppointmentReminders();
    expect(await reminderNotificationFor(clinic.id, todayPatient.id)).toBeNull();
    expect(await reminderNotificationFor(clinic.id, laterPatient.id)).toBeNull();
  });

  it('is not scoped to a single clinic -- a due appointment in each of two clinics both get reminded in one pass', async () => {
    const { clinic: clinicA } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile: doctorA } = await createDoctor(clinicA.id);
    const { user: patientA } = await createUser(clinicA.id, 'PATIENT');
    await createAppointment(clinicA.id, patientA.id, doctorA.id, { date: dateOnlyOffsetFromToday(1) });

    const { clinic: clinicB } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile: doctorB } = await createDoctor(clinicB.id);
    const { user: patientB } = await createUser(clinicB.id, 'PATIENT');
    await createAppointment(clinicB.id, patientB.id, doctorB.id, { date: dateOnlyOffsetFromToday(1) });

    await sendDueAppointmentReminders();
    expect(await reminderNotificationFor(clinicA.id, patientA.id)).not.toBeNull();
    expect(await reminderNotificationFor(clinicB.id, patientB.id)).not.toBeNull();
  });
});

describe('Scheduled follow-up reminders (sendDueFollowUpReminders)', () => {
  async function consultationWithFollowUp(opts: { followUpDate: Date; contacted?: boolean; optedIn?: boolean }) {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const { user: patient } = await createUser(clinic.id, 'PATIENT', { phone: `+9198${Math.floor(10000000 + Math.random() * 89999999)}` });
    if (opts.optedIn) await prisma.user.update({ where: { id: patient.id }, data: { whatsappOptIn: true } });
    const visit = await createAppointment(clinic.id, patient.id, doctorProfile.id, { date: dateOnlyOffsetFromToday(-7), status: 'COMPLETED' });
    const consultation = await prisma.consultation.create({
      data: { appointmentId: visit.id, followUpDate: opts.followUpDate, followUpContacted: opts.contacted ?? false },
    });
    return { clinic, patient, doctorProfile, consultation };
  }

  function followUpNotifications(patientId: string) {
    return prisma.notification.findMany({ where: { patientId, type: 'FOLLOWUP_REMINDER' } });
  }

  it('sends email + WhatsApp the day before the follow-up date, once', async () => {
    const { patient, consultation } = await consultationWithFollowUp({ followUpDate: dateOnlyOffsetFromToday(1), optedIn: true });

    await sendDueFollowUpReminders();
    await sendDueFollowUpReminders();

    const sent = await followUpNotifications(patient.id);
    expect(sent.map((n) => n.channel).sort()).toEqual(['EMAIL', 'WHATSAPP']);
    expect(sent.find((n) => n.channel === 'WHATSAPP')!.status).toBe('SENT');
    const refetched = await prisma.consultation.findUniqueOrThrow({ where: { id: consultation.id } });
    expect(refetched.followUpReminderSentAt).not.toBeNull();
  });

  it('skips a follow-up already handled: contacted, or the patient has already booked', async () => {
    const contacted = await consultationWithFollowUp({ followUpDate: dateOnlyOffsetFromToday(1), contacted: true });
    const booked = await consultationWithFollowUp({ followUpDate: dateOnlyOffsetFromToday(1) });
    await createAppointment(booked.clinic.id, booked.patient.id, booked.doctorProfile.id, { date: dateOnlyOffsetFromToday(1) });

    await sendDueFollowUpReminders();

    expect(await followUpNotifications(contacted.patient.id)).toHaveLength(0);
    expect(await followUpNotifications(booked.patient.id)).toHaveLength(0);
    const bookedRow = await prisma.consultation.findUniqueOrThrow({ where: { id: booked.consultation.id } });
    expect(bookedRow.followUpReminderSentAt).not.toBeNull(); // not re-checked every hour
  });

  it('does nothing for a follow-up that is not due tomorrow', async () => {
    const { patient } = await consultationWithFollowUp({ followUpDate: dateOnlyOffsetFromToday(3) });
    await sendDueFollowUpReminders();
    expect(await followUpNotifications(patient.id)).toHaveLength(0);
  });
});

describe('Follow-up reminder on the day itself', () => {
  async function dueToday(opts: { optedIn?: boolean } = {}) {
    const { clinic } = await setupClinicWithAdmin({ tier: 1 });
    const { doctorProfile } = await createDoctor(clinic.id);
    const { user: patient } = await createUser(clinic.id, 'PATIENT', { phone: `+9198${Math.floor(10000000 + Math.random() * 89999999)}` });
    if (opts.optedIn) await prisma.user.update({ where: { id: patient.id }, data: { whatsappOptIn: true } });
    const visit = await createAppointment(clinic.id, patient.id, doctorProfile.id, { date: dateOnlyOffsetFromToday(-7), status: 'COMPLETED' });
    const consultation = await prisma.consultation.create({
      data: { appointmentId: visit.id, followUpDate: dateOnlyOffsetFromToday(0), followUpReminderSentAt: new Date() },
    });
    return { clinic, patient, doctorProfile, consultation };
  }

  it('sends a "due today" reminder on the follow-up date, once, after the day-before one', async () => {
    const { patient, consultation } = await dueToday({ optedIn: true });
    await sendDueFollowUpReminders();
    await sendDueFollowUpReminders();

    const sent = await prisma.notification.findMany({ where: { patientId: patient.id, type: 'FOLLOWUP_REMINDER' } });
    expect(sent.map((n) => n.channel).sort()).toEqual(['EMAIL', 'WHATSAPP']);
    expect(sent.every((n) => /due today/.test(n.body))).toBe(true);
    const row = await prisma.consultation.findUniqueOrThrow({ where: { id: consultation.id } });
    expect(row.followUpDayReminderSentAt).not.toBeNull();
  });

  it('is skipped when the patient has already come in today', async () => {
    const { clinic, patient, doctorProfile } = await dueToday();
    await createAppointment(clinic.id, patient.id, doctorProfile.id, { date: dateOnlyOffsetFromToday(0), status: 'COMPLETED' });
    await sendDueFollowUpReminders();
    expect(await prisma.notification.count({ where: { patientId: patient.id, type: 'FOLLOWUP_REMINDER' } })).toBe(0);
  });
});
