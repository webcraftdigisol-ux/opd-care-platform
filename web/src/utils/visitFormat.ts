import type { FoodTiming, Prescription, PrescriptionInput, Vitals } from '@opd/shared';

// Visit wording shared by the consultation form, the profile timeline and
// the printout. (The server's PDF has its own copy in utils/visitSummary.ts.)

export const FOOD_TIMING_OPTIONS: { value: FoodTiming; label: string }[] = [
  { value: 'AFTER_FOOD', label: 'After food' },
  { value: 'BEFORE_FOOD', label: 'Before food' },
  { value: 'WITH_FOOD', label: 'With food' },
  { value: 'EMPTY_STOMACH', label: 'Empty stomach' },
];

const FOOD_TIMING_TEXT: Record<FoodTiming, string> = {
  BEFORE_FOOD: 'before food',
  AFTER_FOOD: 'after food',
  WITH_FOOD: 'with food',
  EMPTY_STOMACH: 'on an empty stomach',
};

// "Morning, Night, after food" / "1 sachet · SOS".
export function whenToTake(p: Pick<Prescription, 'morning' | 'afternoon' | 'night' | 'frequency' | 'dosage' | 'foodTiming'>): string {
  const times = [p.morning && 'Morning', p.afternoon && 'Afternoon', p.night && 'Night'].filter(Boolean).join(', ');
  const dose = p.dosage && p.dosage !== '1' ? `${p.dosage} · ` : '';
  return `${dose}${times || p.frequency}${p.foodTiming ? `, ${FOOD_TIMING_TEXT[p.foodTiming]}` : ''}`;
}

// Doses/day × days for the row's live "Total to dispense"; null when the
// timing gives no count (e.g. "SOS").
export function totalToDispense(p: PrescriptionInput): number | null {
  const days = Number(p.durationDays) || 0;
  const ticks = [p.morning, p.afternoon, p.night].filter(Boolean).length;
  if (ticks) return ticks * days;
  const f = (p.frequency ?? '').trim().toUpperCase();
  if (/^\d+(-\d+){1,3}$/.test(f)) return f.split('-').reduce((n, x) => n + Number(x), 0) * days;
  const known: Record<string, number> = { OD: 1, QD: 1, BD: 2, BID: 2, TDS: 3, TID: 3, QID: 4 };
  return f in known ? known[f]! * days : null;
}

export function bmi(v: Vitals | null | undefined): number | null {
  if (!v?.heightCm || !v.weightKg) return null;
  return Math.round((v.weightKg / (v.heightCm / 100) ** 2) * 10) / 10;
}

const SUGAR_TYPE: Record<string, string> = { FASTING: 'fasting', PP: 'PP', RANDOM: 'random' };

// Every vital recorded, as short chips (respiratory rate and sugar too --
// the offline software dropped those).
export function vitalChips(v: Vitals | null | undefined): string[] {
  if (!v) return [];
  const b = bmi(v);
  return [
    v.tempF != null ? `${v.tempF}°F` : v.tempC != null ? `${v.tempC}°C` : null,
    v.pulse != null ? `Pulse ${v.pulse} bpm` : null,
    v.bpSystolic != null || v.bpDiastolic != null ? `BP ${v.bpSystolic ?? '–'}/${v.bpDiastolic ?? '–'} mmHg` : null,
    v.respiratoryRate != null ? `RR ${v.respiratoryRate}/min` : null,
    v.spo2 != null ? `SpO2 ${v.spo2}%` : null,
    v.weightKg != null ? `${v.weightKg} kg` : null,
    v.heightCm != null ? `${v.heightCm} cm` : null,
    b != null ? `BMI ${b}` : null,
    v.bloodSugar != null ? `Sugar ${v.bloodSugar} mg/dL${v.bloodSugarType ? ` (${SUGAR_TYPE[v.bloodSugarType]})` : ''}` : null,
  ].filter((c): c is string => !!c);
}

// Soft warnings for implausible entries: flagged, never blocked.
export function vitalsWarnings(v: Vitals): string[] {
  const w: string[] = [];
  if (v.bpSystolic != null && v.bpDiastolic != null && v.bpSystolic <= v.bpDiastolic) {
    w.push('BP systolic is not above diastolic — are they swapped?');
  }
  if (v.spo2 != null && (v.spo2 > 100 || v.spo2 < 50)) w.push('SpO2 should be between 50 and 100%.');
  if (v.respiratoryRate != null && (v.respiratoryRate < 6 || v.respiratoryRate > 60)) w.push('Respiratory rate looks unusual (normal adult 12–20).');
  if (v.tempF != null && (v.tempF < 90 || v.tempF > 110)) w.push('Temperature looks unusual for °F.');
  if (v.pulse != null && (v.pulse < 30 || v.pulse > 220)) w.push('Pulse looks unusual.');
  return w;
}

export function doctorName(name: string): string {
  return /^dr\.?\s/i.test(name) ? name : `Dr. ${name}`;
}
