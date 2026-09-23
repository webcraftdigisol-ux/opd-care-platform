import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cancelAppointment, listMyAppointments } from '../api/appointments';
import { updateWhatsAppOptIn } from '../api/auth';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';

export function PatientDashboard() {
  const queryClient = useQueryClient();
  const { user, updateUser } = useAuth();
  const { data: appointments, isLoading } = useQuery({
    queryKey: ['my-appointments'],
    queryFn: listMyAppointments,
  });

  const cancelMutation = useMutation({
    mutationFn: cancelAppointment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-appointments'] }),
  });

  const optInMutation = useMutation({
    mutationFn: (whatsappOptIn: boolean) => updateWhatsAppOptIn(whatsappOptIn),
    onSuccess: (updated) => updateUser(updated),
  });

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = appointments?.filter((a) => a.date >= today && a.status !== 'CANCELLED') ?? [];
  const past = appointments?.filter((a) => a.date < today || a.status === 'CANCELLED') ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-teal">My Appointments</h1>
        <Link
          to="/book"
          className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-mid"
        >
          + Book Appointment
        </Link>
      </div>

      {isLoading && <p className="text-gray-500">Loading…</p>}

      <section className="mb-8 flex items-center justify-between rounded-lg border border-teal-light bg-white p-4 shadow-sm">
        <div>
          <p className="font-medium text-gray-700">WhatsApp reminders</p>
          <p className="text-sm text-gray-500">
            Receive appointment reminders, prescriptions and diet plans on WhatsApp.
          </p>
        </div>
        <button
          onClick={() => optInMutation.mutate(!user?.whatsappOptIn)}
          disabled={optInMutation.isPending}
          className={`rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60 ${
            user?.whatsappOptIn ? 'bg-teal text-white hover:bg-teal-mid' : 'border border-teal text-teal hover:bg-teal-light'
          }`}
        >
          {user?.whatsappOptIn ? 'Opted in' : 'Opt in'}
        </button>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Upcoming</h2>
        {upcoming.length === 0 && <p className="text-gray-500">No upcoming appointments.</p>}
        <div className="space-y-3">
          {upcoming.map((a) => (
            <div key={a.id} className="rounded-lg border border-teal-light bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{a.doctor?.user.name}</p>
                  <p className="text-sm text-gray-500">
                    {a.doctor?.specialization} · {a.date}
                    {a.startTime ? ` · ${a.startTime}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-gold">#{a.tokenNumber}</p>
                  <StatusBadge status={a.status} />
                </div>
              </div>
              {a.status === 'BOOKED' && (
                <button
                  onClick={() => cancelMutation.mutate(a.id)}
                  className="mt-3 text-sm text-red-500 hover:underline"
                >
                  Cancel appointment
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">History</h2>
        {past.length === 0 && <p className="text-gray-500">No past appointments.</p>}
        <div className="space-y-3">
          {past.map((a) => (
            <div key={a.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{a.doctor?.user.name}</p>
                  <p className="text-sm text-gray-500">
                    {a.date}
                    {a.startTime ? ` · ${a.startTime}` : ''}
                  </p>
                </div>
                <StatusBadge status={a.status} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
