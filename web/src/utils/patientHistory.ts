import type { Appointment, Consultation, Vitals } from '@opd/shared';

export type VisitWithConsultation = Appointment & { consultation: Consultation };

// A patient's earlier consulted visits, newest first, excluding the visit
// currently being consulted (whose details are the form being edited).
export function previousVisits(appointments: Appointment[], currentAppointmentId: string): VisitWithConsultation[] {
  return appointments
    .filter((a): a is VisitWithConsultation => a.id !== currentAppointmentId && !!a.consultation)
    .sort((a, b) => b.date.localeCompare(a.date) || b.tokenNumber - a.tokenNumber);
}

export interface VitalsPoint {
  x: string; // visit date
  y: number;
}

// One vital's recorded values across visits, oldest first (the order a
// trend chart reads left to right). Visits that didn't record it are skipped.
export function vitalsSeries(visits: VisitWithConsultation[], key: keyof Vitals): VitalsPoint[] {
  return visits
    .filter((v) => typeof v.consultation.vitals?.[key] === 'number')
    .map((v) => ({ x: v.date, y: v.consultation.vitals![key] as number }))
    .sort((a, b) => a.x.localeCompare(b.x));
}

// "120/80", "120/–" or null -- BP is two fields but reads as one value.
export function formatBp(vitals: Vitals | null): string | null {
  if (!vitals || (vitals.bpSystolic == null && vitals.bpDiastolic == null)) return null;
  return `${vitals.bpSystolic ?? '–'}/${vitals.bpDiastolic ?? '–'}`;
}
