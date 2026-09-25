import { describe, expect, it } from 'vitest';
import { navLinksFor } from './navLinks';

const labels = (role: Parameters<typeof navLinksFor>[0], tier: number) => navLinksFor(role, tier).map((l) => l.label);

describe('navLinksFor', () => {
  it('gates admin pharmacy/lab/radiology on Tier 2 and IPD on Tier 3', () => {
    expect(labels('ADMIN', 1)).not.toContain('Pharmacy');
    expect(labels('ADMIN', 1)).not.toContain('In-Patients');
    expect(labels('ADMIN', 2)).toEqual(expect.arrayContaining(['Pharmacy', 'Lab', 'Radiology']));
    expect(labels('ADMIN', 2)).not.toContain('Wards');
    expect(labels('ADMIN', 3)).toEqual(expect.arrayContaining(['In-Patients', 'Wards']));
  });

  it('always gives admins the core OPD pages', () => {
    expect(labels('ADMIN', 1)).toEqual(
      expect.arrayContaining(['Doctors', 'Walk-in', 'Staff', 'Reports', 'Notifications', 'Billing']),
    );
  });

  it('keeps nurses to In-Patients, and only head nurses get Wards', () => {
    expect(labels('NURSE', 3)).toEqual(['In-Patients']);
    expect(labels('HEAD_NURSE', 3)).toEqual(['In-Patients', 'Wards']);
  });

  it('only links doctors to In-Patients on Tier 3', () => {
    expect(labels('DOCTOR', 1)).toEqual(['Reports']);
    expect(labels('DOCTOR', 3)).toEqual(['In-Patients', 'Reports']);
  });

  it('has no duplicate destinations for any role', () => {
    for (const role of ['ADMIN', 'DOCTOR', 'PHARMACIST', 'LAB_TECHNICIAN', 'RADIOLOGY_TECHNICIAN', 'NURSE', 'HEAD_NURSE', 'RECEPTIONIST', 'PATIENT'] as const) {
      const tos = navLinksFor(role, 3).map((l) => l.to);
      expect(new Set(tos).size).toBe(tos.length);
    }
  });
});
