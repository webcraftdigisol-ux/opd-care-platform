import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Department } from '@opd/shared';
import { getQueue, listRecentInvoices, listRecentSales } from '../api/departments';
import { PatientSearch } from '../components/PatientSearch';
import { Card, EmptyState, PageHeader, btnSecondary } from '../components/ui';
import { Icon } from '../components/Icon';
import { formatDate, sexAge } from '../utils/patientFormat';
import { doctorName } from '../utils/visitFormat';
import { DEPTS, money } from '../utils/departments';

// A department counter's home: find the patient (by name, mobile or
// Patient ID), or pick them from the patients the doctors have sent here
// in the last week; recent receipts below for reprinting.
export function DepartmentHomePage({ dept }: { dept: Department }) {
  const info = DEPTS[dept];
  const navigate = useNavigate();
  const { data: queue, isLoading } = useQuery({ queryKey: ['dept-queue', dept], queryFn: () => getQueue(dept), refetchInterval: 30_000 });
  const { data: receipts } = useQuery({
    queryKey: ['dept-receipts', dept],
    queryFn: async () =>
      dept === 'PHARMACY'
        ? (await listRecentSales()).map((s) => ({ id: s.id, createdAt: s.createdAt, patient: s.patient?.name, count: s.items.length, total: s.total }))
        : (await listRecentInvoices(dept === 'LAB' ? 'lab' : 'radiology')).map((i) => ({
            id: i.id,
            createdAt: i.createdAt,
            patient: i.patient?.name,
            count: i.items.length,
            total: i.total,
          })),
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader
        title={info.label}
        subtitle={`Find the patient to see the ${info.items} the doctor ordered.`}
        actions={
          <Link to={`${info.base}/settings`} className={btnSecondary}>
            <Icon name="book" className="h-4 w-4" /> {info.listTitle}
          </Link>
        }
      />

      <Card className="mb-6">
        <PatientSearch size="lg" autoFocus onSelect={(p) => navigate(`${info.base}/patients/${p.id}`)} />
      </Card>

      <Card title="Waiting" subtitle={`Patients with ${info.items} still to do from a visit in the last 7 days`} className="mb-6">
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : !queue?.length ? (
          <EmptyState>No one is waiting.</EmptyState>
        ) : (
          <ul className="-mx-2 divide-y divide-gray-100" data-testid="dept-queue">
            {queue.map((q) => (
              <li key={q.appointmentId}>
                <Link
                  to={`${info.base}/patients/${q.patient.id}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-gray-50"
                  data-testid="queue-row"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-light text-sm font-semibold text-teal">
                    {q.patient.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-900">{q.patient.name}</span>
                      {q.patient.patientCode && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600">{q.patient.patientCode}</span>
                      )}
                      <span className="text-xs text-gray-500">{[sexAge(q.patient.gender, q.patient.age), q.patient.phone].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="block truncate text-xs text-gray-500">
                      {formatDate(q.visitDate)} · {doctorName(q.doctorName)} · {q.items.join(', ')}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                    {q.pending} of {q.total} to do
                  </span>
                  <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Recent receipts">
        {!receipts?.length ? (
          <p className="text-sm text-gray-500">No receipts yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {receipts.slice(0, 15).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="w-36 shrink-0 text-gray-500">{new Date(r.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-gray-900">{r.patient ?? '—'}</span>
                <span className="text-gray-500">
                  {r.count} {r.count === 1 ? info.item : info.items}
                </span>
                <span className="w-24 text-right font-medium">{money(r.total)}</span>
                <a href={`/receipts/${info.base.slice(1)}/${r.id}`} target="_blank" rel="noreferrer" className="text-teal hover:underline">
                  Receipt
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
