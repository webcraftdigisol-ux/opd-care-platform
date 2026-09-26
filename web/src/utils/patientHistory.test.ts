import { describe, expect, it } from 'vitest';
import type { Appointment, Consultation, Vitals } from '@opd/shared';
import { formatBp, previousVisits, vitalsSeries } from './patientHistory';

function consultation(vitals: Vitals | null = null): Consultation {
  return {
    id: `c-${Math.random()}`,
    appointmentId: 'x',
    vitals,
    chiefComplaint: null,
    presentIllness: null,
    relevantHistory: null,
    diagnosis: null,
    differentialDiagnosis: null,
    notes: null,
    imagingAdvice: null,
    doctorNotes: null,
    followUpDate: null,
    followUpContacted: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    prescriptions: [],
    labTestsOrdered: [],
    radiologyOrdered: [],
  };
}

function appt(id: string, date: string, c: Consultation | null, tokenNumber = 1): Appointment {
  return {
    id,
    patientId: 'p1',
    guestName: null,
    guestPhone: null,
    doctorId: 'd1',
    date,
    tokenNumber,
    startTime: null,
    status: 'COMPLETED',
    isWalkIn: false,
    reason: null,
    consultationFee: 0,
    createdAt: `${date}T00:00:00.000Z`,
    consultation: c,
  };
}

describe('previousVisits', () => {
  it('excludes the current appointment and visits never consulted, newest first', () => {
    const visits = previousVisits(
      [
        appt('old', '2026-01-10', consultation()),
        appt('current', '2026-09-25', consultation()),
        appt('no-show', '2026-05-01', null),
        appt('recent', '2026-08-02', consultation()),
      ],
      'current',
    );
    expect(visits.map((v) => v.id)).toEqual(['recent', 'old']);
  });

  it('orders same-day visits by token, latest first', () => {
    const visits = previousVisits(
      [appt('a', '2026-03-03', consultation(), 1), appt('b', '2026-03-03', consultation(), 4)],
      'none',
    );
    expect(visits.map((v) => v.id)).toEqual(['b', 'a']);
  });
});

describe('vitalsSeries', () => {
  it('returns recorded values oldest first, skipping visits without that vital', () => {
    const visits = previousVisits(
      [
        appt('v3', '2026-07-01', consultation({ pulse: 80 })),
        appt('v1', '2026-01-01', consultation({ pulse: 72 })),
        appt('v2', '2026-04-01', consultation({ weightKg: 70 })),
        appt('v0', '2025-12-01', consultation(null)),
      ],
      'none',
    );
    expect(vitalsSeries(visits, 'pulse')).toEqual([
      { x: '2026-01-01', y: 72 },
      { x: '2026-07-01', y: 80 },
    ]);
    expect(vitalsSeries(visits, 'weightKg')).toEqual([{ x: '2026-04-01', y: 70 }]);
  });
});

describe('formatBp', () => {
  it('formats both, one, or neither reading', () => {
    expect(formatBp({ bpSystolic: 120, bpDiastolic: 80 })).toBe('120/80');
    expect(formatBp({ bpSystolic: 130 })).toBe('130/–');
    expect(formatBp({ pulse: 70 })).toBeNull();
    expect(formatBp(null)).toBeNull();
  });
});
