import { describe, expect, it } from 'vitest';
import type { Role } from '@opd/shared';
import { navLinksFor } from './navLinks';

const labels = (role: Role, tier: number) => navLinksFor(role, tier).map((l) => l.label);
const destinations = (role: Role, tier: number) => navLinksFor(role, tier).map((l) => l.to);

const STAFF_ROLES: Role[] = ['DOCTOR', 'PHARMACIST', 'LAB_TECHNICIAN', 'RADIOLOGY_TECHNICIAN', 'NURSE', 'HEAD_NURSE', 'RECEPTIONIST'];

describe('navLinksFor', () => {
  it('gives admin every other staff role\'s screens on a Tier 3 clinic', () => {
    const admin = new Set(destinations('ADMIN', 3));
    for (const role of STAFF_ROLES) {
      for (const to of destinations(role, 3)) {
        if (to === '/doctor') continue; // the doctor's own queue; admin has Today's queue
        expect(admin, `${role} → ${to}`).toContain(to);
      }
    }
  });

  it('gates admin services on Tier 2 and IPD on Tier 3', () => {
    expect(labels('ADMIN', 1)).not.toContain('Pharmacy counter');
    expect(labels('ADMIN', 1)).not.toContain('In-Patients');
    expect(labels('ADMIN', 2)).toEqual(expect.arrayContaining(['Pharmacy counter', 'Lab counter', 'Radiology counter']));
    expect(labels('ADMIN', 2)).not.toContain('Wards');
    expect(labels('ADMIN', 3)).toEqual(expect.arrayContaining(['In-Patients', 'Wards', 'Admit patient']));
  });

  it('always gives admins the core OPD pages', () => {
    expect(labels('ADMIN', 1)).toEqual(
      expect.arrayContaining(['Dashboard', 'New Patient', 'Find Patient', 'Walk-in', 'Doctors', 'Staff', 'Reports', 'Notifications', 'Subscription']),
    );
  });

  it('lets the desk and doctors register and find patients', () => {
    for (const role of ['RECEPTIONIST', 'DOCTOR'] as const) {
      expect(labels(role, 1)).toEqual(expect.arrayContaining(['New Patient', 'Find Patient']));
    }
  });

  it('keeps nurses to In-Patients, and only head nurses get Wards', () => {
    expect(labels('NURSE', 3)).toEqual(['In-Patients']);
    expect(labels('HEAD_NURSE', 3)).toEqual(['In-Patients', 'Wards']);
  });

  it('only links doctors to In-Patients on Tier 3', () => {
    expect(labels('DOCTOR', 1)).not.toContain('In-Patients');
    expect(labels('DOCTOR', 3)).toContain('In-Patients');
  });

  it('has no duplicate destinations for any role', () => {
    for (const role of ['ADMIN', ...STAFF_ROLES, 'PATIENT'] as const) {
      const tos = destinations(role, 3);
      expect(new Set(tos).size).toBe(tos.length);
    }
  });
});
