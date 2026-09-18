import { computeRoomCharges } from '../../src/utils/ipdBilling';

describe('computeRoomCharges', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('bills a single-bed stay at that bed\'s daily rate for the whole span', () => {
    const admittedAt = new Date('2026-01-01T00:00:00.000Z');
    const dischargedAt = new Date('2026-01-04T00:00:00.000Z'); // 3 days later
    const rates = new Map([['bed-A', 1200]]);
    const total = computeRoomCharges(admittedAt, 'bed-A', [], dischargedAt, rates);
    expect(total).toBe(3 * 1200);
  });

  it('splits a stay across a room transfer, pricing each segment at its own bed rate', () => {
    // Admitted to the general ward (₹1200/day), transferred to ICU (₹4500/day)
    // a day later, discharged a day after that -- two one-day segments.
    const admittedAt = new Date('2026-01-01T00:00:00.000Z');
    const transferredAt = new Date('2026-01-02T00:00:00.000Z');
    const dischargedAt = new Date('2026-01-03T00:00:00.000Z');
    const rates = new Map([
      ['general', 1200],
      ['icu', 4500],
    ]);
    const total = computeRoomCharges(
      admittedAt,
      'icu',
      [{ fromBedId: 'general', toBedId: 'icu', transferredAt }],
      dischargedAt,
      rates,
    );
    expect(total).toBe(1200 + 4500);
  });

  it('bills a same-day admission/discharge as a minimum of 1 day, never 0', () => {
    const admittedAt = new Date('2026-01-01T10:00:00.000Z');
    const dischargedAt = new Date('2026-01-01T14:00:00.000Z'); // 4 hours later
    const rates = new Map([['bed-A', 1200]]);
    const total = computeRoomCharges(admittedAt, 'bed-A', [], dischargedAt, rates);
    expect(total).toBe(1200);
  });

  it('rounds a partial day up to a full day per segment', () => {
    const admittedAt = new Date('2026-01-01T00:00:00.000Z');
    const dischargedAt = new Date(admittedAt.getTime() + 1.2 * DAY); // 1.2 days
    const rates = new Map([['bed-A', 1000]]);
    const total = computeRoomCharges(admittedAt, 'bed-A', [], dischargedAt, rates);
    expect(total).toBe(2000); // ceil(1.2) = 2 days
  });

  it('handles multiple transfers, summing every segment at its own rate', () => {
    const admittedAt = new Date('2026-01-01T00:00:00.000Z');
    const t1 = new Date('2026-01-02T00:00:00.000Z');
    const t2 = new Date('2026-01-03T00:00:00.000Z');
    const dischargedAt = new Date('2026-01-05T00:00:00.000Z');
    const rates = new Map([
      ['ward', 1000],
      ['icu', 5000],
      ['private', 3000],
    ]);
    const total = computeRoomCharges(
      admittedAt,
      'private',
      [
        { fromBedId: 'ward', toBedId: 'icu', transferredAt: t1 },
        { fromBedId: 'icu', toBedId: 'private', transferredAt: t2 },
      ],
      dischargedAt,
      rates,
    );
    // ward: 1 day, icu: 1 day, private: 2 days
    expect(total).toBe(1000 + 5000 + 2 * 3000);
  });
});
