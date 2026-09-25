import type { Role } from '@opd/shared';

export interface NavLink {
  to: string;
  label: string;
}

// The per-role top-nav links, shared by the desktop bar and the mobile
// menu in Navbar so the two can't drift apart. Tier gating mirrors the
// server's: pharmacy/lab/radiology need Tier 2+, IPD needs Tier 3.
export function navLinksFor(role: Role, tier: number): NavLink[] {
  const tierAllowsPharmacyLab = tier >= 2;
  const tierAllowsIpd = tier >= 3;

  switch (role) {
    case 'ADMIN':
      return [
        { to: '/admin/doctors', label: 'Doctors' },
        { to: '/admin/walk-in', label: 'Walk-in' },
        ...(tierAllowsPharmacyLab
          ? [
              { to: '/admin/pharmacy', label: 'Pharmacy' },
              { to: '/admin/lab', label: 'Lab' },
              { to: '/admin/radiology', label: 'Radiology' },
            ]
          : []),
        { to: '/admin/staff', label: 'Staff' },
        ...(tierAllowsIpd
          ? [
              { to: '/admin/ipd/admissions', label: 'In-Patients' },
              { to: '/admin/ipd/wards', label: 'Wards' },
            ]
          : []),
        { to: '/admin/reports', label: 'Reports' },
        { to: '/admin/notifications', label: 'Notifications' },
        { to: '/admin/billing', label: 'Billing' },
      ];
    case 'DOCTOR':
      return [
        ...(tierAllowsIpd ? [{ to: '/admin/ipd/admissions', label: 'In-Patients' }] : []),
        { to: '/admin/reports', label: 'Reports' },
      ];
    case 'PHARMACIST':
      return [
        { to: '/pharmacy', label: 'Counter' },
        { to: '/admin/pharmacy', label: 'Medicine Catalog' },
      ];
    case 'LAB_TECHNICIAN':
      return [
        { to: '/lab', label: 'Counter' },
        { to: '/admin/lab', label: 'Test Catalog' },
      ];
    case 'RADIOLOGY_TECHNICIAN':
      return [
        { to: '/radiology', label: 'Counter' },
        { to: '/admin/radiology', label: 'Test Catalog' },
      ];
    case 'NURSE':
      return [{ to: '/admin/ipd/admissions', label: 'In-Patients' }];
    case 'HEAD_NURSE':
      return [
        { to: '/admin/ipd/admissions', label: 'In-Patients' },
        { to: '/admin/ipd/wards', label: 'Wards' },
      ];
    case 'RECEPTIONIST':
      return [
        { to: '/reception', label: 'Reception' },
        { to: '/admin/walk-in', label: 'Walk-in' },
      ];
    case 'PATIENT':
      return [
        { to: '/book', label: 'Book Appointment' },
        { to: '/records', label: 'My Records' },
      ];
    default:
      return [];
  }
}
