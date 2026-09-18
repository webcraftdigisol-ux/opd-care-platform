import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { searchPatients } from '../api/patients';
import { listDoctors } from '../api/doctors';
import { admitPatient, listVacantBeds } from '../api/ipd';
import type { PublicUser } from '@opd/shared';

export function IpdAdmitPatientPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [patient, setPatient] = useState<PublicUser | null>(null);
  const [bedId, setBedId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [reason, setReason] = useState('');
  const [depositAmount, setDepositAmount] = useState('0');
  const [error, setError] = useState<string | null>(null);

  const { data: results } = useQuery({
    queryKey: ['patient-search', search],
    queryFn: () => searchPatients(search),
    enabled: search.length > 1,
  });
  const { data: vacantBeds } = useQuery({ queryKey: ['ipd-vacant-beds'], queryFn: listVacantBeds });
  const { data: doctors } = useQuery({ queryKey: ['doctors'], queryFn: listDoctors });

  const admitMutation = useMutation({
    mutationFn: () =>
      admitPatient({
        patientId: patient!.id,
        bedId,
        admittingDoctorId: doctorId,
        reason: reason || undefined,
        depositAmount: Number(depositAmount) || 0,
      }),
    onSuccess: (admission) => navigate(`/admin/ipd/admissions/${admission.id}`),
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not admit patient'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!patient) return setError('Select a patient first');
    if (!bedId) return setError('Select a bed');
    if (!doctorId) return setError('Select the admitting doctor');
    admitMutation.mutate();
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-teal">Admit Patient</h1>

      {!patient ? (
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <label className="mb-1 block text-sm font-medium text-gray-700">Search patient by name or phone</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
          <div className="mt-3 space-y-2">
            {results?.map((p) => (
              <button
                key={p.id}
                onClick={() => setPatient(p)}
                className="block w-full rounded-md border border-gray-200 p-3 text-left hover:border-teal hover:bg-teal-light"
              >
                <p className="font-medium">{p.name}</p>
                <p className="text-sm text-gray-500">{p.phone ?? p.email}</p>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between rounded-md bg-teal-light p-3">
            <div>
              <p className="font-medium">{patient.name}</p>
              <p className="text-sm text-gray-500">{patient.phone ?? patient.email}</p>
            </div>
            <button type="button" onClick={() => setPatient(null)} className="text-sm text-teal hover:underline">
              Change
            </button>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Bed</label>
            <select
              required
              value={bedId}
              onChange={(e) => setBedId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="">Select a vacant bed</option>
              {vacantBeds?.map((bed) => (
                <option key={bed.id} value={bed.id}>
                  {bed.wardName} — {bed.label} (₹{bed.dailyRate}/day)
                </option>
              ))}
            </select>
            {vacantBeds?.length === 0 && <p className="mt-1 text-xs text-red-500">No vacant beds available.</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Admitting doctor</label>
            <select
              required
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="">Select a doctor</option>
              {doctors?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.user.name} — {d.specialization}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Reason for admission</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Deposit collected</label>
            <input
              type="number"
              min={0}
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={admitMutation.isPending}
            className="w-full rounded-md bg-teal py-2 font-medium text-white hover:bg-teal-mid disabled:opacity-60"
          >
            {admitMutation.isPending ? 'Admitting…' : 'Admit Patient'}
          </button>
        </form>
      )}
    </div>
  );
}
