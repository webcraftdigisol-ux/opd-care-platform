import type { Role } from '@opd/shared';
import type { IconName } from '../components/Icon';

export interface NavLink {
  to: string;
  label: string;
  icon: IconName;
}

export interface NavSection {
  title?: string;
  links: NavLink[];
}

// The sidebar, per role. Admin can do everything, so admin gets every
// screen the clinic's tier includes; every other role sees only its own.
// Tier gating mirrors the server's: pharmacy/lab/radiology need Tier 2+,
// IPD needs Tier 3.
export function navSectionsFor(role: Role, tier: number): NavSection[] {
  const tier2 = tier >= 2;
  const tier3 = tier >= 3;

  const newPatient: NavLink = { to: '/patients/new', label: 'New Patient', icon: 'userPlus' };
  const findPatient: NavLink = { to: '/patients', label: 'Find Patient', icon: 'search' };
  const walkIn: NavLink = { to: '/admin/walk-in', label: 'Walk-in', icon: 'walkIn' };
  const inPatients: NavLink = { to: '/admin/ipd/admissions', label: 'In-Patients', icon: 'bed' };
  const wards: NavLink = { to: '/admin/ipd/wards', label: 'Wards', icon: 'building' };
  const reports: NavLink = { to: '/admin/reports', label: 'Reports', icon: 'chart' };
  const appointments: NavLink = { to: '/appointments', label: 'Appointments', icon: 'calendar' };
  const catalogue: NavLink = { to: '/catalogue', label: "Doctor's Catalogue", icon: 'book' };

  switch (role) {
    case 'ADMIN':
      return [
        {
          links: [
            { to: '/admin', label: 'Dashboard', icon: 'dashboard' },
            newPatient,
            appointments,
            findPatient,
            { to: '/reception', label: "Today's queue", icon: 'queue' },
            walkIn,
            catalogue,
          ],
        },
        ...(tier2
          ? [
              {
                title: 'Services',
                links: [
                  { to: '/pharmacy', label: 'Pharmacy counter', icon: 'pill' as const },
                  { to: '/admin/pharmacy', label: 'Medicine Catalog', icon: 'book' as const },
                  { to: '/lab', label: 'Lab counter', icon: 'flask' as const },
                  { to: '/admin/lab', label: 'Lab test catalog', icon: 'book' as const },
                  { to: '/radiology', label: 'Radiology counter', icon: 'scan' as const },
                  { to: '/admin/radiology', label: 'Radiology catalog', icon: 'book' as const },
                ],
              },
            ]
          : []),
        ...(tier3
          ? [
              {
                title: 'In-patients',
                links: [inPatients, { to: '/admin/ipd/admit', label: 'Admit patient', icon: 'plus' as const }, wards],
              },
            ]
          : []),
        {
          title: 'Clinic',
          links: [
            { to: '/admin/doctors', label: 'Doctors', icon: 'doctor' },
            { to: '/admin/staff', label: 'Staff', icon: 'shield' },
            reports,
            { to: '/admin/notifications', label: 'Notifications', icon: 'bell' },
            { to: '/admin/settings', label: 'Clinic settings', icon: 'building' },
            { to: '/admin/billing', label: 'Subscription', icon: 'card' },
          ],
        },
      ];
    case 'DOCTOR':
      return [
        {
          links: [
            { to: '/doctor', label: 'My queue', icon: 'stethoscope' },
            appointments,
            findPatient,
            newPatient,
            catalogue,
            ...(tier3 ? [inPatients] : []),
            reports,
          ],
        },
      ];
    case 'RECEPTIONIST':
      return [
        {
          links: [
            { to: '/reception', label: "Today's queue", icon: 'queue' },
            appointments,
            newPatient,
            findPatient,
            walkIn,
          ],
        },
      ];
    case 'PHARMACIST':
      return [
        {
          links: [
            { to: '/pharmacy', label: 'Counter', icon: 'pill' },
            { to: '/admin/pharmacy', label: 'Medicine Catalog', icon: 'book' },
          ],
        },
      ];
    case 'LAB_TECHNICIAN':
      return [
        {
          links: [
            { to: '/lab', label: 'Counter', icon: 'flask' },
            { to: '/admin/lab', label: 'Test Catalog', icon: 'book' },
          ],
        },
      ];
    case 'RADIOLOGY_TECHNICIAN':
      return [
        {
          links: [
            { to: '/radiology', label: 'Counter', icon: 'scan' },
            { to: '/admin/radiology', label: 'Test Catalog', icon: 'book' },
          ],
        },
      ];
    case 'NURSE':
      return [{ links: [inPatients] }];
    case 'HEAD_NURSE':
      return [{ links: [inPatients, wards] }];
    case 'PATIENT':
      return [
        {
          links: [
            { to: '/', label: 'Home', icon: 'home' },
            { to: '/book', label: 'Book Appointment', icon: 'calendar' },
            { to: '/records', label: 'My Records', icon: 'records' },
          ],
        },
      ];
    default:
      return [];
  }
}

export function navLinksFor(role: Role, tier: number): NavLink[] {
  return navSectionsFor(role, tier).flatMap((s) => s.links);
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  DOCTOR: 'Doctor',
  RECEPTIONIST: 'Receptionist',
  PHARMACIST: 'Pharmacist',
  LAB_TECHNICIAN: 'Lab technician',
  RADIOLOGY_TECHNICIAN: 'Radiology technician',
  NURSE: 'Nurse',
  HEAD_NURSE: 'Head nurse',
  PATIENT: 'Patient',
};
