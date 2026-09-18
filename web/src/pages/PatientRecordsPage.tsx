import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { getPatientRecords } from '../api/patients';
import { StatusBadge } from '../components/StatusBadge';

export function PatientRecordsPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['patient-records', user?.id],
    queryFn: () => getPatientRecords(user!.id),
    enabled: !!user,
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-teal">My Medical Records</h1>
      {isLoading && <p className="text-gray-500">Loading…</p>}
      <div className="space-y-4">
        {data?.appointments
          .filter((a) => a.consultation)
          .map((a) => (
            <div key={a.id} className="rounded-lg border border-teal-light bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="font-medium">{a.doctor?.user.name}</p>
                  <p className="text-sm text-gray-500">{a.date}</p>
                </div>
                <StatusBadge status={a.status} />
              </div>
              {a.consultation?.diagnosis && (
                <p className="text-sm">
                  <span className="font-medium">Diagnosis: </span>
                  {a.consultation.diagnosis}
                </p>
              )}
              {a.consultation?.notes && (
                <p className="text-sm text-gray-600">{a.consultation.notes}</p>
              )}
              {a.consultation && a.consultation.prescriptions.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm font-medium">Prescriptions</p>
                  <ul className="ml-4 list-disc text-sm text-gray-600">
                    {a.consultation.prescriptions.map((p) => (
                      <li key={p.id}>
                        {p.medicine} — {p.dosage}, {p.frequency}, {p.durationDays} days
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        {data && data.appointments.filter((a) => a.consultation).length === 0 && (
          <p className="text-gray-500">No medical records yet.</p>
        )}
      </div>
    </div>
  );
}
