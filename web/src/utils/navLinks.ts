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
// IPD needs Tier 3. From Tier 2 the departments' own lists replace the
// Doctor's Catalogue -- doctors prescribe from what the pharmacy stocks.
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
  // One entry per department; its page has Counter / List / Report tabs.
  const pharmacy: NavLink = { to: '/pharmacy', label: 'Pharmacy', icon: 'pill' };
  const lab: NavLink = { to: '/lab', label: 'Laboratory', icon: 'flask' };
  const radiology: NavLink = { to: '/radiology', label: 'Radiology', icon: 'scan' };
  const departments = [pharmacy, lab, radiology];
  const catalogue: NavLink[] = tier2 ? [] : [{ to: '/catalogue', label: "Doctor's Catalogue", icon: 'book' }];

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
            reports,
            ...catalogue,
          ],
        },
        ...(tier2
          ? [
              {
                title: 'Departments',
                links: departments,
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
            ...catalogue,
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
      return [{ links: [pharmacy] }];
    case 'LAB_TECHNICIAN':
      return [{ links: [lab] }];
    case 'RADIOLOGY_TECHNICIAN':
      return [{ links: [radiology] }];
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
