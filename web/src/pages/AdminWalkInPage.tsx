import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { listDoctors } from '../api/doctors';
import { registerWalkIn } from '../api/appointments';

export function AdminWalkInPage() {
  const { data: doctors } = useQuery({ queryKey: ['doctors'], queryFn: listDoctors });
  const [doctorId, setDoctorId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<number | null>(null);

  const walkInMutation = useMutation({
    mutationFn: registerWalkIn,
    onSuccess: (appointment) => {
      setSuccess(appointment.tokenNumber);
      setPatientName('');
      setPatientPhone('');
      setReason('');
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not register walk-in'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!doctorId) {
      setError('Please select a doctor');
      return;
    }
    walkInMutation.mutate({ doctorId, patientName, patientPhone, reason: reason || undefined });
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-teal">Register Walk-in Patient</h1>
      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Doctor</label>
          <select
            required
            data-testid="walkin-doctor"
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
          <label className="mb-1 block text-sm font-medium text-gray-700">Patient name</label>
          <input
            required
            data-testid="walkin-patient-name"
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Patient phone</label>
          <input
            required
            data-testid="walkin-patient-phone"
            value={patientPhone}
            onChange={(e) => setPatientPhone(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Reason (optional)</label>
          <input
            data-testid="walkin-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          />
        </div>
        {error && <p className="text-sm text-red-600" data-testid="walkin-error">{error}</p>}
        {success !== null && (
          <p className="rounded-md bg-teal-light p-3 text-sm text-teal" data-testid="walkin-success">
            Registered! Token number <span className="font-bold">#{success}</span>
          </p>
        )}
        <button
          type="submit"
          disabled={walkInMutation.isPending}
          className="w-full rounded-md bg-teal py-2 font-medium text-white hover:bg-teal-mid disabled:opacity-60"
        >
          {walkInMutation.isPending ? 'Registering…' : 'Register & Assign Token'}
        </button>
      </form>
    </div>
  );
}
