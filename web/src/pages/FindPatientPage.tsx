import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { recentPatients } from '../api/patients';
import { PatientResultRow, PatientSearch } from '../components/PatientSearch';
import { Card, PageHeader, btnPrimary } from '../components/ui';
import { Icon } from '../components/Icon';
import { useAuth } from '../context/AuthContext';

export function FindPatientPage() {
  const { user } = useAuth();
  const canRegister = user && ['ADMIN', 'RECEPTIONIST', 'DOCTOR'].includes(user.role);
  const { data: recent } = useQuery({ queryKey: ['recent-patients', 10], queryFn: () => recentPatients(10) });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Find patient"
        subtitle="Type any part of a name, a mobile number or a Patient ID — matches appear as you type."
        actions={
          canRegister && (
            <Link to="/patients/new" className={btnPrimary}>
              <Icon name="plus" className="h-4 w-4" /> New Patient
            </Link>
          )
        }
      />
      <PatientSearch autoFocus size="lg" />

      <Card title="Recently registered" className="mt-8">
        {!recent?.length ? (
          <p className="text-sm text-gray-500">No patients registered yet.</p>
        ) : (
          <ul className="-mx-3 divide-y divide-gray-100">
            {recent.map((p) => (
              <li key={p.id}>
                <Link to={`/patients/${p.id}`} className="block rounded-lg hover:bg-gray-50">
                  <PatientResultRow p={p} showLastVisit={false} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
