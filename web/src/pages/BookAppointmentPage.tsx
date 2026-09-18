import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { listDoctors } from '../api/doctors';
import { bookAppointment } from '../api/appointments';

export function BookAppointmentPage() {
  const navigate = useNavigate();
  const { data: doctors, isLoading } = useQuery({ queryKey: ['doctors'], queryFn: listDoctors });
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const bookMutation = useMutation({
    mutationFn: bookAppointment,
    onSuccess: (appointment) => {
      navigate('/', { state: { justBooked: appointment.tokenNumber } });
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not book appointment'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!doctorId) {
      setError('Please select a doctor');
      return;
    }
    bookMutation.mutate({ doctorId, date, reason: reason || undefined });
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-teal">Book an Appointment</h1>
      {isLoading ? (
        <p className="text-gray-500">Loading doctors…</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl bg-white p-6 shadow-sm">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Doctor</label>
            <select
              required
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-teal focus:outline-none"
            >
              <option value="">Select a doctor</option>
              {doctors?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.user.name} — {d.specialization} ({d.department})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
            <input
              type="date"
              required
              min={new Date().toISOString().slice(0, 10)}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-teal focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Reason for visit (optional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-teal focus:outline-none"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={bookMutation.isPending}
            className="w-full rounded-md bg-teal py-2 font-medium text-white hover:bg-teal-mid disabled:opacity-60"
          >
            {bookMutation.isPending ? 'Booking…' : 'Confirm Booking'}
          </button>
        </form>
      )}
    </div>
  );
}
