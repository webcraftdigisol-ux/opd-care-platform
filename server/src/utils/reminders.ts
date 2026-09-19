import { prisma } from '../prisma';
import { notifyPatientEmail } from './notify';

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
    await notifyPatientEmail({
      clinicId: appointment.clinicId,
      patientId: appointment.patientId,
      type: 'APPOINTMENT_REMINDER',
      to: appointment.patient.email,
      subject: `Reminder: your appointment tomorrow — Token #${appointment.tokenNumber}`,
      body: `Hi ${appointment.patient.name}, this is a reminder that you have an appointment with Dr. ${appointment.doctor.user.name} tomorrow (${appointment.date.toISOString().slice(0, 10)})${appointment.startTime ? ` at ${appointment.startTime}` : ''}. Your token number is #${appointment.tokenNumber}.`,
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
