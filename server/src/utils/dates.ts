import { HttpError } from '../middleware/errorHandler';

// Every date-only value in this app (Appointment.date, IPD admission days,
// etc.) is stored as UTC midnight and compared that way -- there's no
// per-clinic timezone handling, a known simplification. Keep that
// convention in one place so every route parses "YYYY-MM-DD" the same way.
export function parseDateOnly(dateStr: string): Date {
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, 'Invalid date, expected YYYY-MM-DD');
  }
  return date;
}
