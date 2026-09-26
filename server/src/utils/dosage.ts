// Best-effort parse of a doctor's free-text frequency into doses/day, used
// only to pre-fill a suggested pharmacy quantity. Always editable by the
// pharmacist — this is a convenience, not a source of truth.
export function parseDosesPerDay(frequency: string): number {
  const normalized = frequency.trim().toUpperCase();

  const dashPattern = /^\d+(-\d+){1,3}$/;
  if (dashPattern.test(normalized)) {
    return normalized
      .split('-')
      .map(Number)
      .reduce((sum, n) => sum + n, 0);
  }

  const knownFrequencies: Record<string, number> = {
    OD: 1,
    QD: 1,
    'ONCE DAILY': 1,
    'ONCE A DAY': 1,
    BD: 2,
    BID: 2,
    'TWICE DAILY': 2,
    'TWICE A DAY': 2,
    TDS: 3,
    TID: 3,
    'THRICE DAILY': 3,
    'THREE TIMES A DAY': 3,
    QID: 4,
    'FOUR TIMES A DAY': 4,
  };

  if (normalized in knownFrequencies) {
    return knownFrequencies[normalized];
  }

  return 1;
}

export function suggestPharmacyQuantity(frequency: string, durationDays: number): number {
  return Math.max(1, parseDosesPerDay(frequency) * durationDays);
}

// "1-0-1" from the Morning/Afternoon/Night ticks.
export function frequencyFromTicks(t: { morning?: boolean; afternoon?: boolean; night?: boolean }): string {
  return [t.morning, t.afternoon, t.night].map((on) => (on ? '1' : '0')).join('-');
}

// The "Total to dispense" shown on a prescription row: doses per day ×
// days, when the timing says how many doses a day (ticks, "1-0-1", BD...).
// Null for "SOS"/free text, where there's no honest number to show.
export function totalToDispense(p: {
  morning: boolean;
  afternoon: boolean;
  night: boolean;
  frequency: string;
  durationDays: number;
}): number | null {
  const ticks = [p.morning, p.afternoon, p.night].filter(Boolean).length;
  if (ticks > 0) return ticks * p.durationDays;
  const f = p.frequency.trim().toUpperCase();
  if (/^\d+(-\d+){1,3}$/.test(f) || /^(OD|QD|BD|BID|TDS|TID|QID)$/.test(f)) {
    return parseDosesPerDay(f) * p.durationDays;
  }
  return null;
}
