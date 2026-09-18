import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listAdmissions } from '../api/ipd';
import type { AdmissionStatus } from '@opd/shared';

export function IpdAdmissionsPage() {
  const [status, setStatus] = useState<AdmissionStatus>('ADMITTED');
  const { data: admissions, isLoading } = useQuery({
    queryKey: ['ipd-admissions', status],
    queryFn: () => listAdmissions(status),
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-teal">In-Patients</h1>
        <Link to="/admin/ipd/admit" className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-mid">
          + Admit Patient
        </Link>
      </div>

      <div className="mb-4 flex gap-2">
        {(['ADMITTED', 'DISCHARGED'] as AdmissionStatus[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              status === s ? 'bg-teal text-white' : 'border border-gray-300 text-gray-600'
            }`}
          >
            {s === 'ADMITTED' ? 'Currently Admitted' : 'Discharged'}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-gray-500">Loading…</p>}
      {!isLoading && admissions?.length === 0 && <p className="text-gray-500">No admissions here.</p>}

      <div className="space-y-3">
        {admissions?.map((a) => (
          <Link
            key={a.id}
            to={`/admin/ipd/admissions/${a.id}`}
            className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-teal"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{a.patient?.name}</p>
                <p className="text-sm text-gray-500">
                  {a.wardName} · {a.bedLabel} · Dr. {a.admittingDoctorName}
                </p>
              </div>
              <div className="text-right text-sm text-gray-500">
                <p>Admitted {new Date(a.admittedAt).toLocaleDateString()}</p>
                {a.dischargedAt && <p>Discharged {new Date(a.dischargedAt).toLocaleDateString()}</p>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
