import { computeDaySlots } from '../../src/utils/slots';

describe('computeDaySlots', () => {
  it('splits a single window into evenly-sized slots', () => {
    const slots = computeDaySlots([{ startTime: '09:00', endTime: '09:45' }], 15, new Set(), null);
    expect(slots.map((s) => s.startTime)).toEqual(['09:00', '09:15', '09:30']);
    expect(slots.every((s) => s.available)).toBe(true);
  });

  it('drops a trailing slot that would run past the window end', () => {
    // 09:00-09:50 at 15-minute slots: 09:00, 09:15, 09:30 fit; 09:45-10:00 would not.
    const slots = computeDaySlots([{ startTime: '09:00', endTime: '09:50' }], 15, new Set(), null);
    expect(slots.map((s) => s.startTime)).toEqual(['09:00', '09:15', '09:30']);
  });

  it('marks a booked start time as unavailable without removing it from the list', () => {
    const slots = computeDaySlots([{ startTime: '09:00', endTime: '09:45' }], 15, new Set(['09:15']), null);
    expect(slots.find((s) => s.startTime === '09:15')?.available).toBe(false);
    expect(slots.find((s) => s.startTime === '09:00')?.available).toBe(true);
  });

  it('marks a slot before the current time as unavailable when nowMinutes is given', () => {
    // 09:30 = 570 minutes
    const slots = computeDaySlots([{ startTime: '09:00', endTime: '09:45' }], 15, new Set(), 570);
    expect(slots.find((s) => s.startTime === '09:00')?.available).toBe(false);
    expect(slots.find((s) => s.startTime === '09:15')?.available).toBe(false);
    expect(slots.find((s) => s.startTime === '09:30')?.available).toBe(true);
  });

  it('merges and sorts multiple non-contiguous windows in the same day', () => {
    const slots = computeDaySlots(
      [
        { startTime: '14:00', endTime: '14:30' },
        { startTime: '09:00', endTime: '09:30' },
      ],
      15,
      new Set(),
      null,
    );
    expect(slots.map((s) => s.startTime)).toEqual(['09:00', '09:15', '14:00', '14:15']);
  });

  it('returns an empty list for an empty window set (doctor not scheduled that day)', () => {
    expect(computeDaySlots([], 15, new Set(), null)).toEqual([]);
  });
});
