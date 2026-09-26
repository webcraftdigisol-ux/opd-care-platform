import type { AppointmentStatus, Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { notifyPatientEmail } from './notify';
import { notifyPatientWhatsApp } from './whatsapp';
import { withPatient } from './patients';

// The one background job in this app that isn't triggered by a user
// action or an HTTP request -- see scheduler.ts for what calls this on a
// timer. Unlike every route handler elsewhere, this is deliberately NOT
// scoped to a single clinicId: it's a system-wide sweep across every
// clinic's due reminders in one pass, the same way a real cron job would
// run once for the whole deployment rather than once per tenant.
export async function sendDueAppointmentReminders(): Promise<{ sent: number }> {
  // Date-only, UTC-midnight comparison -- the same convention every other
  // date field in this app uses (see parseDateOnly in utils/dates.ts).
  // There's no per-clinic timezone handling, so "tomorrow" here means UTC
  // tomorrow for every clinic alike, not each clinic's local tomorrow --
  // a known simplification consistent with the rest of the app.
  const tomorrow = new Date();
  tomorrow.setUTCHours(0, 0, 0, 0);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const due = await prisma.appointment.findMany({
    where: {
      date: tomorrow,
      status: 'BOOKED',
      isWalkIn: false,
      reminderSentAt: null,
      // A booking for someone not registered yet has nobody to remind.
      patientId: { not: null },
    },
    include: { patient: true, doctor: { include: { user: true } } },
  });

  for (const found of due) {
    const appointment = withPatient(found);
    const reminderBody = `Hi ${appointment.patient.name}, this is a reminder that you have an appointment with Dr. ${appointment.doctor.user.name} tomorrow (${appointment.date.toISOString().slice(0, 10)})${appointment.startTime ? ` at ${appointment.startTime}` : ''}. Your token number is #${appointment.tokenNumber}.`;

    await notifyPatientEmail({
      clinicId: appointment.clinicId,
      patientId: appointment.patientId,
      type: 'APPOINTMENT_REMINDER',
      to: appointment.patient.email,
      subject: `Reminder: your appointment tomorrow — Token #${appointment.tokenNumber}`,
      body: reminderBody,
    });
    // WhatsApp as an additional channel for the same reminder -- gated on
    // the patient's own opt-in (see notifyPatientWhatsApp), not a
    // replacement for email, so a patient who hasn't opted in still gets
    // the email reminder as before.
    await notifyPatientWhatsApp({
      clinicId: appointment.clinicId,
      patientId: appointment.patientId,
      type: 'APPOINTMENT_REMINDER',
      to: appointment.patient.phone,
      optedIn: appointment.patient.whatsappOptIn,
      templateName: 'appointment_reminder',
      params: [
        appointment.patient.name,
        appointment.doctor.user.name,
        appointment.date.toISOString().slice(0, 10),
        appointment.startTime ?? '—',
        `#${appointment.tokenNumber}`,
      ],
      renderedBody: reminderBody,
    });
    // Marked as attempted regardless of SENT/FAILED/SKIPPED -- see the
    // schema comment on reminderSentAt. One attempt per appointment, never
    // retried, the same single-attempt philosophy as every other
    // notification trigger in this app (booking confirmation, payment
    // received, etc. don't retry either).
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { reminderSentAt: new Date() },
    });
  }

  return { sent: due.length };
}

type FollowUpConsultation = Prisma.ConsultationGetPayload<{
  include: { appointment: { include: { patient: true; doctor: { include: { user: true } } } } };
}>;

// One follow-up reminder, by email and WhatsApp (the latter only if the
// patient opted in). Shared by the manual "Send reminder" button on the
// Follow-ups report and the automatic jobs below, so they all say the same
// thing. `onTheDay` is the reminder sent on the follow-up date itself.
export async function sendFollowUpReminder(consultation: FollowUpConsultation, opts: { onTheDay?: boolean } = {}) {
  const appointment = withPatient(consultation.appointment);
  const due = consultation.followUpDate!.toISOString().slice(0, 10);
  const doctor = /^dr\.?\s/i.test(appointment.doctor.user.name) ? appointment.doctor.user.name : `Dr. ${appointment.doctor.user.name}`;
  const body = opts.onTheDay
    ? `Hi ${appointment.patient.name}, your follow-up with ${doctor} is due today (${due}). Please visit the clinic or call to fix a time.`
    : `Hi ${appointment.patient.name}, this is a reminder for your follow-up with ${doctor} (due ${due}). Please call the clinic to schedule your visit.`;

  const email = await notifyPatientEmail({
    clinicId: appointment.clinicId,
    patientId: appointment.patientId,
    type: 'FOLLOWUP_REMINDER',
    to: appointment.patient.email,
    subject: opts.onTheDay ? 'Your follow-up is due today' : 'Follow-up reminder',
    body,
  });
  const whatsapp = await notifyPatientWhatsApp({
    clinicId: appointment.clinicId,
    patientId: appointment.patientId,
    type: 'FOLLOWUP_REMINDER',
    to: appointment.patient.phone,
    optedIn: appointment.patient.whatsappOptIn,
    templateName: opts.onTheDay ? 'followup_due_today' : 'followup_reminder',
    params: [appointment.patient.name, appointment.doctor.user.name, due],
    renderedBody: body,
  });
  return { email, whatsapp };
}

// Automatic follow-up reminders: one the day before the follow-up date and
// one on the date itself -- same "UTC day" convention as appointment
// reminders above. Each is attempted once (marked whatever happens, so it
// isn't re-checked every hour) and skipped when the follow-up is already
// handled: staff marked the patient contacted, or the patient already has a
// visit booked (or, on the day, has come in).
export async function sendDueFollowUpReminders(): Promise<{ sent: number }> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const include = { appointment: { include: { patient: true, doctor: { include: { user: true } } } } } as const;

  const [dayBefore, onTheDay] = await Promise.all([
    prisma.consultation.findMany({
      where: { followUpDate: tomorrow, followUpContacted: false, followUpReminderSentAt: null },
      include,
    }),
    prisma.consultation.findMany({
      where: { followUpDate: today, followUpContacted: false, followUpDayReminderSentAt: null },
      include,
    }),
  ]);

  const alreadyBooked = (c: FollowUpConsultation, statuses: AppointmentStatus[]) =>
    prisma.appointment.findFirst({
      where: {
        clinicId: c.appointment.clinicId,
        patientId: c.appointment.patientId,
        date: { gte: today },
        status: { in: statuses },
        id: { not: c.appointmentId },
      },
    });

  let sent = 0;
  for (const consultation of dayBefore) {
    if (!(await alreadyBooked(consultation, ['BOOKED', 'CHECKED_IN']))) {
      await sendFollowUpReminder(consultation);
      sent++;
    }
    await prisma.consultation.update({ where: { id: consultation.id }, data: { followUpReminderSentAt: new Date() } });
  }
  for (const consultation of onTheDay) {
    if (!(await alreadyBooked(consultation, ['BOOKED', 'CHECKED_IN', 'IN_CONSULTATION', 'COMPLETED']))) {
      await sendFollowUpReminder(consultation, { onTheDay: true });
      sent++;
    }
    await prisma.consultation.update({ where: { id: consultation.id }, data: { followUpDayReminderSentAt: new Date() } });
  }
  return { sent };
}
