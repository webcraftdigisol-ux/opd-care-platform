import type { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { notifyPatientEmail } from './notify';
import { notifyPatientWhatsApp } from './whatsapp';

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
    },
    include: { patient: true, doctor: { include: { user: true } } },
  });

  for (const appointment of due) {
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
// Follow-ups report and the automatic day-before job below, so both say the
// same thing.
export async function sendFollowUpReminder(consultation: FollowUpConsultation) {
  const { appointment } = consultation;
  const due = consultation.followUpDate!.toISOString().slice(0, 10);
  const body = `Hi ${appointment.patient.name}, this is a reminder for your follow-up with Dr. ${appointment.doctor.user.name} (due ${due}). Please call the clinic to schedule your visit.`;

  const email = await notifyPatientEmail({
    clinicId: appointment.clinicId,
    patientId: appointment.patientId,
    type: 'FOLLOWUP_REMINDER',
    to: appointment.patient.email,
    subject: 'Follow-up reminder',
    body,
  });
  const whatsapp = await notifyPatientWhatsApp({
    clinicId: appointment.clinicId,
    patientId: appointment.patientId,
    type: 'FOLLOWUP_REMINDER',
    to: appointment.patient.phone,
    optedIn: appointment.patient.whatsappOptIn,
    templateName: 'followup_reminder',
    params: [appointment.patient.name, appointment.doctor.user.name, due],
    renderedBody: body,
  });
  return { email, whatsapp };
}

// Automatic follow-up reminders, the day before a consultation's follow-up
// date -- same "tomorrow in UTC" convention as appointment reminders above.
// Skipped (but still marked, so it isn't re-checked every hour) when the
// follow-up is already handled: staff marked the patient contacted, or the
// patient already has an upcoming appointment at this clinic.
export async function sendDueFollowUpReminders(): Promise<{ sent: number }> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const due = await prisma.consultation.findMany({
    where: { followUpDate: tomorrow, followUpContacted: false, followUpReminderSentAt: null },
    include: { appointment: { include: { patient: true, doctor: { include: { user: true } } } } },
  });

  let sent = 0;
  for (const consultation of due) {
    const upcoming = await prisma.appointment.findFirst({
      where: {
        clinicId: consultation.appointment.clinicId,
        patientId: consultation.appointment.patientId,
        date: { gte: today },
        status: { in: ['BOOKED', 'CHECKED_IN'] },
        id: { not: consultation.appointmentId },
      },
    });
    if (!upcoming) {
      await sendFollowUpReminder(consultation);
      sent++;
    }
    await prisma.consultation.update({
      where: { id: consultation.id },
      data: { followUpReminderSentAt: new Date() },
    });
  }
  return { sent };
}
