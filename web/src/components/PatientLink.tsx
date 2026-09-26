import { Link } from 'react-router-dom';
import type { PublicUser } from '@opd/shared';

// A patient's name in a list, linking to their profile, with the Patient ID.
export function PatientLink({ patient }: { patient?: PublicUser }) {
  if (!patient) return null;
  return (
    <Link to={`/patients/${patient.id}`} className="font-medium text-gray-900 hover:text-teal hover:underline">
      {patient.name}
      {patient.patientCode && <span className="ml-1.5 font-mono text-xs font-normal text-gray-500">{patient.patientCode}</span>}
    </Link>
  );
}
