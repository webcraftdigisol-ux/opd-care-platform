// Pure, DB-free slot math for fixed time-slot booking -- given a doctor's
// schedule window(s) for a day, their per-appointment slot length, and which
// start times are already taken, produce the bookable grid. Kept separate
// from the route so it's directly unit-testable, the same way
// computeRoomCharges/findBestNameMatch are.

export interface ScheduleWindow {
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
}

export interface DoctorSlot {
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  available: boolean;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

// `nowMinutes`: pass the current time-of-day in minutes (0-1439) to mask out
// already-past slots -- only meaningful when the day being queried is today.
// Pass null for any other date, so nothing gets filtered on that basis.
export function computeDaySlots(
  windows: ScheduleWindow[],
  slotMinutes: number,
  bookedStartTimes: ReadonlySet<string>,
  nowMinutes: number | null,
): DoctorSlot[] {
  const slots: DoctorSlot[] = [];
  for (const window of windows) {
    const start = toMinutes(window.startTime);
    const end = toMinutes(window.endTime);
    for (let t = start; t + slotMinutes <= end; t += slotMinutes) {
      const startTime = toHHMM(t);
      const isPast = nowMinutes != null && t < nowMinutes;
      slots.push({
        startTime,
        endTime: toHHMM(t + slotMinutes),
        available: !isPast && !bookedStartTimes.has(startTime),
      });
    }
  }
  return slots.sort((a, b) => (a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0));
}
