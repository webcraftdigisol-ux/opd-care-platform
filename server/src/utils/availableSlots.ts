import { prisma } from '../prisma';
import { computeDaySlots, type DoctorSlot } from './slots';

// Shared by GET /doctors/:id/slots (what the UI shows as pickable) and the
// booking route (what it actually validates against) -- one source of truth
// so the two can never drift apart.
export async function getAvailableSlots(doctorId: string, date: Date, slotMinutes: number): Promise<DoctorSlot[]> {
  const dayOfWeek = date.getUTCDay();
  const [windows, booked] = await Promise.all([
    prisma.schedule.findMany({ where: { doctorId, dayOfWeek } }),
    prisma.appointment.findMany({
      where: { doctorId, date, status: { not: 'CANCELLED' }, startTime: { not: null } },
      select: { startTime: true },
    }),
  ]);

  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const isToday = date.getTime() === startOfToday.getTime();
  const now = new Date();
  const nowMinutes = isToday ? now.getUTCHours() * 60 + now.getUTCMinutes() : null;

  return computeDaySlots(windows, slotMinutes, new Set(booked.map((b) => b.startTime!)), nowMinutes);
}
