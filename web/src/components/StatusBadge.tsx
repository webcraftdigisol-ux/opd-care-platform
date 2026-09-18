import type { AppointmentStatus } from '@opd/shared';

const STYLES: Record<AppointmentStatus, string> = {
  BOOKED: 'bg-gold-light text-gold border-gold-mid',
  CHECKED_IN: 'bg-teal-light text-teal border-teal-mid',
  IN_CONSULTATION: 'bg-blue-50 text-blue-700 border-blue-300',
  COMPLETED: 'bg-green-50 text-green-700 border-green-300',
  CANCELLED: 'bg-gray-100 text-gray-500 border-gray-300',
  NO_SHOW: 'bg-red-50 text-red-600 border-red-300',
};

const LABELS: Record<AppointmentStatus, string> = {
  BOOKED: 'Booked',
  CHECKED_IN: 'Checked In',
  IN_CONSULTATION: 'In Consultation',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No Show',
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
