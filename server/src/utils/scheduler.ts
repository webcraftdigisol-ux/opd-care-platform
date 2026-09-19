import cron from 'node-cron';
import { sendDueAppointmentReminders } from './reminders';

// Started only from index.ts, never from app.ts -- app.ts is imported
// directly by the test suite (see helpers.ts) to drive the Express app
// through Supertest without binding a port, and a background cron timer
// running against the test database on every import would be both wasted
// work and a source of flaky cross-test interference. index.ts is the one
// place that represents "the server is actually running for real."
export function startReminderScheduler(): void {
  // Reminders are date-only ("tomorrow"), so the exact minute doesn't
  // matter -- hourly is frequent enough that a reminder goes out within an
  // hour of becoming due, without polling so often it's pointless.
  cron.schedule('0 * * * *', () => {
    sendDueAppointmentReminders()
      .then(({ sent }) => {
        if (sent > 0) console.log(`Sent ${sent} appointment reminder(s)`);
      })
      .catch((err) => {
        console.error('Failed to send appointment reminders:', err);
      });
  });
}
