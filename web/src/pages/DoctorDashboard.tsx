import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getQueue, updateAppointmentStatus } from '../api/appointments';
import { StatusBadge } from '../components/StatusBadge';
import type { AppointmentStatus } from '@opd/shared';

const NEXT_STATUS: Partial<Record<AppointmentStatus, AppointmentStatus>> = {
  BOOKED: 'CHECKED_IN',
  CHECKED_IN: 'IN_CONSULTATION',
};

export function DoctorDashboard() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const queryClient = useQueryClient();

  const { data: queue, isLoading } = useQuery({
    queryKey: ['doctor-queue', date],
    queryFn: () => getQueue(undefined, date),
    refetchInterval: 15000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AppointmentStatus }) =>
      updateAppointmentStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['doctor-queue', date] }),
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-teal">Today's Queue</h1>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2"
        />
      </div>

      {isLoading && <p className="text-gray-500">Loading…</p>}
      {!isLoading && queue?.length === 0 && <p className="text-gray-500">No appointments for this date.</p>}

      <div className="space-y-3">
        {queue?.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-lg border border-teal-light bg-white p-4 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-light font-bold text-teal">
                {a.tokenNumber}
              </div>
              <div>
                <p className="font-medium">
                  {a.patient?.name}
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    {a.startTime ?? 'Walk-in'}
                  </span>
                </p>
                <p className="text-sm text-gray-500">{a.reason || 'No reason given'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={a.status} />
              {NEXT_STATUS[a.status] && (
                <button
                  onClick={() => statusMutation.mutate({ id: a.id, status: NEXT_STATUS[a.status]! })}
                  className="rounded-md border border-teal px-3 py-1.5 text-sm text-teal hover:bg-teal hover:text-white"
                >
                  Mark {NEXT_STATUS[a.status]?.replace('_', ' ').toLowerCase()}
                </button>
              )}
              {(a.status === 'CHECKED_IN' || a.status === 'IN_CONSULTATION') && (
                <Link
                  to={`/doctor/consult/${a.id}`}
                  className="rounded-md bg-teal px-3 py-1.5 text-sm text-white hover:bg-teal-mid"
                >
                  Consult
                </Link>
              )}
              {a.status !== 'COMPLETED' && a.status !== 'CANCELLED' && (
                <button
                  onClick={() => statusMutation.mutate({ id: a.id, status: 'NO_SHOW' })}
                  className="text-sm text-gray-400 hover:text-red-500"
                >
                  No show
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
