import type { Role } from '@opd/shared';

export function homeRouteForRole(role: Role): string {
  switch (role) {
    case 'DOCTOR':
      return '/doctor';
    case 'ADMIN':
      return '/admin';
    case 'PHARMACIST':
      return '/pharmacy';
    case 'LAB_TECHNICIAN':
      return '/lab';
    case 'RADIOLOGY_TECHNICIAN':
      return '/radiology';
    case 'RECEPTIONIST':
      return '/reception';
    case 'NURSE':
    case 'HEAD_NURSE':
      return '/admin/ipd/admissions';
    default:
      return '/';
  }
}
