import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listAllAppointments } from '../api/admin';
import { StatusBadge } from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';

export function AdminDashboard() {
  const { clinic } = useAuth();
  const tierAllowsPharmacyLab = (clinic?.tier ?? 1) >= 2;
  const tierAllowsIpd = (clinic?.tier ?? 1) >= 3;
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const { data: appointments, isLoading } = useQuery({
    queryKey: ['admin-appointments', date],
    queryFn: () => listAllAppointments(date),
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-teal">Admin Overview</h1>
        <div className="flex gap-2">
          <Link to="/admin/doctors" className="rounded-md border border-teal px-3 py-2 text-sm text-teal hover:bg-teal-light">
            Manage Doctors
          </Link>
          <Link to="/admin/walk-in" className="rounded-md bg-teal px-3 py-2 text-sm text-white hover:bg-teal-mid">
            Register Walk-in
          </Link>
          {tierAllowsPharmacyLab && (
            <>
              <Link to="/admin/pharmacy" className="rounded-md border border-teal px-3 py-2 text-sm text-teal hover:bg-teal-light">
                Pharmacy
              </Link>
              <Link to="/admin/lab" className="rounded-md border border-teal px-3 py-2 text-sm text-teal hover:bg-teal-light">
                Lab
              </Link>
              <Link to="/admin/staff" className="rounded-md border border-teal px-3 py-2 text-sm text-teal hover:bg-teal-light">
                Staff
              </Link>
            </>
          )}
          {tierAllowsIpd && (
            <>
              <Link to="/admin/ipd/admissions" className="rounded-md border border-teal px-3 py-2 text-sm text-teal hover:bg-teal-light">
                In-Patients
              </Link>
              <Link to="/admin/ipd/wards" className="rounded-md border border-teal px-3 py-2 text-sm text-teal hover:bg-teal-light">
                Wards
              </Link>
            </>
          )}
          <Link to="/admin/reports" className="rounded-md border border-teal px-3 py-2 text-sm text-teal hover:bg-teal-light">
            Reports
          </Link>
        </div>
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
              <th className="px-4 py-2">Patient</th>
              <th className="px-4 py-2">Doctor</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {appointments?.map((a) => (
              <tr key={a.id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium">#{a.tokenNumber}</td>
                <td className="px-4 py-2">{a.patient?.name}</td>
                <td className="px-4 py-2">{a.doctor?.user.name}</td>
                <td className="px-4 py-2 text-gray-500">{a.isWalkIn ? 'Walk-in' : 'Booked'}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={a.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
