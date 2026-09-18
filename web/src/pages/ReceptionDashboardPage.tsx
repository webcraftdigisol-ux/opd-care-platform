import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listAllAppointments } from '../api/admin';
import { StatusBadge } from '../components/StatusBadge';
import { PaymentRecorder } from '../components/PaymentRecorder';

export function ReceptionDashboardPage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [expandedFee, setExpandedFee] = useState<string | null>(null);
  const { data: appointments, isLoading } = useQuery({
    queryKey: ['admin-appointments', date],
    queryFn: () => listAllAppointments(date),
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-teal">Front Desk</h1>
        <Link to="/admin/walk-in" className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-mid">
          Register Walk-in
        </Link>
      </div>

      <div className="mb-4">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2"
        />
      </div>

      {isLoading && <p className="text-gray-500">Loading…</p>}
      {!isLoading && appointments?.length === 0 && <p className="text-gray-500">No appointments for this date.</p>}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-teal-light text-teal">
            <tr>
              <th className="px-4 py-2">Token</th>
              <th className="px-4 py-2">Time</th>
              <th className="px-4 py-2">Patient</th>
              <th className="px-4 py-2">Doctor</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Fee</th>
            </tr>
          </thead>
          <tbody>
            {appointments?.map((a) => (
              <Fragment key={a.id}>
                <tr className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium">#{a.tokenNumber}</td>
                  <td className="px-4 py-2 text-gray-500">{a.startTime ?? '—'}</td>
                  <td className="px-4 py-2">{a.patient?.name}</td>
                  <td className="px-4 py-2">{a.doctor?.user.name}</td>
                  <td className="px-4 py-2 text-gray-500">{a.isWalkIn ? 'Walk-in' : 'Booked'}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-2">
                    {a.consultationFee > 0 ? (
                      <button
                        onClick={() => setExpandedFee(expandedFee === a.id ? null : a.id)}
                        className="text-teal hover:underline"
                      >
                        ₹{a.consultationFee.toFixed(2)}
                      </button>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
                {expandedFee === a.id && (
                  <tr className="border-t border-gray-100 bg-gray-50">
                    <td colSpan={7} className="px-4 py-2">
                      <PaymentRecorder billType="CONSULTATION" billId={a.id} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
