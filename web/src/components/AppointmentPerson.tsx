import type { Appointment } from '@opd/shared';
import { PatientLink } from './PatientLink';
import { Icon } from './Icon';

// Who an appointment is for: a registered patient links to their profile;
// a booking for someone not registered yet shows the name as plain text
// with the mobile, marked so the desk registers them on arrival.
export function AppointmentPerson({ appointment: a }: { appointment: Appointment }) {
  if (a.patient) return <PatientLink patient={a.patient} />;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2">
      <span className="font-medium text-gray-900">{a.guestName}</span>
      {a.guestPhone && (
        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
          <Icon name="phone" className="h-3.5 w-3.5" /> {a.guestPhone}
        </span>
      )}
      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">Not registered</span>
    </span>
  );
}
