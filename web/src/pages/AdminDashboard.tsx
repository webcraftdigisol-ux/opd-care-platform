import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listAllAppointments } from '../api/admin';
import { getDashboard } from '../api/dashboard';
import { recentPatients } from '../api/patients';
import { useAuth } from '../context/AuthContext';
import { StatusBadge } from '../components/StatusBadge';
import { AppointmentPerson } from '../components/AppointmentPerson';
import { PaymentRecorder } from '../components/PaymentRecorder';
import { PatientResultRow, PatientSearch } from '../components/PatientSearch';
import { DayBarChart } from '../components/DayBarChart';
import { Card, btnPrimary, btnSecondary } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';
import { formatMoney } from '../utils/patientFormat';
import { doctorName } from '../utils/visitFormat';
import { localDate } from './AppointmentsPage';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function Stat({ icon, label, value, tone }: { icon: IconName; label: string; value: string | number | undefined; tone: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <span>
        <span className="block text-sm text-gray-500">{label}</span>
        <span className="block text-2xl font-semibold text-gray-900" data-testid={`stat-${label}`}>
          {value ?? '—'}
        </span>
      </span>
    </div>
  );
}

// The admin's home: find or register a patient first, then the day at a
// glance -- headline counts, the month's appointments and collections,
// recent registrations and today's queue (with fee collection).
export function AdminDashboard() {
  const { user } = useAuth();
  const today = localDate();
  const [date, setDate] = useState(today);
  const [expandedFee, setExpandedFee] = useState<string | null>(null);
  const { data: summary } = useQuery({ queryKey: ['dashboard', today], queryFn: () => getDashboard(today) });
  const { data: recent } = useQuery({ queryKey: ['recent-patients', 5], queryFn: () => recentPatients(5) });
  const { data: appointments, isLoading } = useQuery({
    queryKey: ['admin-appointments', date],
    queryFn: () => listAllAppointments(date),
  });
  const monthName = new Date(`${today}T12:00:00`).toLocaleDateString('en-IN', { month: 'long' });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {greeting()}, {user?.name.split(' ')[0]}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/appointments?book=1" className={btnSecondary}>
            <Icon name="calendar" className="h-4 w-4" /> Schedule appointment
          </Link>
          <Link to="/admin/walk-in" className={btnSecondary}>
            Walk-in
          </Link>
          <Link to="/patients/new" className={btnPrimary}>
            <Icon name="plus" className="h-4 w-4" /> New Patient
          </Link>
        </div>
      </div>

      <div className="mb-6">
        <PatientSearch size="lg" />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon="user" label="Total patients" value={summary?.totalPatients} tone="bg-teal-light text-teal" />
        <Stat icon="userPlus" label="Registered today" value={summary?.registeredToday} tone="bg-gold-light text-gold" />
        <Stat icon="calendar" label="Appointments today" value={summary?.appointmentsToday} tone="bg-sky-50 text-sky-700" />
        <Stat
          icon="rupee"
          label={`Collected in ${monthName}`}
          value={summary?.revenueThisMonth != null ? formatMoney(summary.revenueThisMonth) : undefined}
          tone="bg-emerald-50 text-emerald-700"
        />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card title="Appointments this month" subtitle="Visits and bookings per day, cancellations excluded">
          {summary ? <DayBarChart days={summary.days} value={(d) => d.appointments} format={(n) => String(Math.round(n))} label="Appointments per day this month" /> : <p className="h-40" />}
        </Card>
        <Card title="Revenue collected this month" subtitle="Payments received per day">
          {summary ? (
            <DayBarChart
              days={summary.days}
              value={(d) => d.revenue ?? 0}
              format={(n) => (n >= 1000 ? `₹${Math.round(n / 100) / 10}k` : `₹${Math.round(n)}`)}
              label="Revenue collected per day this month"
            />
          ) : (
            <p className="h-40" />
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Recently registered" className="lg:col-span-1" actions={<Link to="/patients" className="text-sm text-teal hover:underline">Find patient</Link>}>
          {!recent?.length ? (
            <p className="text-sm text-gray-500">No patients yet.</p>
          ) : (
            <ul className="-mx-3 divide-y divide-gray-100" data-testid="recently-registered">
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

        <Card
          title={date === today ? "Today's queue" : 'Queue'}
          className="lg:col-span-2"
          actions={<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-sm" aria-label="Queue date" />}
        >
          {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
          {!isLoading && appointments?.length === 0 && <p className="text-sm text-gray-500">No appointments for this date.</p>}
          {!!appointments?.length && (
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-gray-500">
                  <tr className="border-b border-gray-100">
                    <th className="px-5 py-2 font-medium">Token</th>
                    <th className="px-2 py-2 font-medium">Patient</th>
                    <th className="px-2 py-2 font-medium">Doctor</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-5 py-2 font-medium">Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((a) => (
                    <Fragment key={a.id}>
                      <tr className="border-b border-gray-50">
                        <td className="px-5 py-2 font-medium">
                          #{a.tokenNumber}
                          {a.startTime && <span className="block text-xs font-normal text-gray-400">{a.startTime}</span>}
                        </td>
                        <td className="px-2 py-2">
                          <AppointmentPerson appointment={a} />
                        </td>
                        <td className="px-2 py-2 text-gray-600">{a.doctor && doctorName(a.doctor.user.name)}</td>
                        <td className="px-2 py-2">
                          <StatusBadge status={a.status} />
                        </td>
                        <td className="px-5 py-2">
                          {a.consultationFee > 0 && a.patientId ? (
                            <button onClick={() => setExpandedFee(expandedFee === a.id ? null : a.id)} className="text-teal hover:underline">
                              ₹{a.consultationFee.toFixed(2)}
                            </button>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                      {expandedFee === a.id && (
                        <tr className="bg-gray-50">
                          <td colSpan={5} className="px-5 py-2">
                            <PaymentRecorder billType="CONSULTATION" billId={a.id} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Link to="/appointments" className="mt-3 inline-block text-sm text-teal hover:underline">
            Open appointments →
          </Link>
        </Card>
      </div>
    </div>
  );
}
