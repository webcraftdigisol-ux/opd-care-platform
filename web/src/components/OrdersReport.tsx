import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Department, OrderReportStatus, OrdersReport as Report } from '@opd/shared';
import { getOrdersReport } from '../api/reports';
import { listDoctors } from '../api/doctors';
import { useAuth } from '../context/AuthContext';
import { Card, btnPrimary, btnSecondary } from './ui';
import { Icon } from './Icon';
import { cell, download, presets } from './RevenueReport';
import { formatDate, formatMoney } from '../utils/patientFormat';
import { doctorName } from '../utils/visitFormat';
import { DEPTS } from '../utils/departments';

const ALL: Department[] = ['PHARMACY', 'LAB', 'RADIOLOGY'];
const WHAT: Record<Department, string> = { PHARMACY: 'Medicines prescribed', LAB: 'Lab tests ordered', RADIOLOGY: 'Radiology ordered' };
const STATUS: Record<OrderReportStatus, { label: string; tone: string }> = {
  IN_HOUSE: { label: 'Done in-house', tone: 'bg-emerald-50 text-emerald-700' },
  SUBSTITUTED: { label: 'In-house (substitute)', tone: 'bg-teal-light text-teal' },
  NOT_DONE: { label: 'Not done here', tone: 'bg-gray-100 text-gray-600' },
  PENDING: { label: 'Pending', tone: 'bg-amber-50 text-amber-800' },
};
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

export function ordersToCsv(report: Report): string {
  const header = ['Visit date', 'Department', 'Patient', 'Patient ID', 'Doctor', 'Ordered', 'Status', 'Done as', 'Quantity', 'Amount', 'Note'];
  const lines = report.rows.map((r) =>
    [r.date, DEPTS[r.department].label, r.patientName, r.patientCode, r.doctorName, r.ordered, STATUS[r.status].label, r.doneAs, r.quantity, r.amount, r.note]
      .map(cell)
      .join(','),
  );
  return [header.map(cell).join(','), ...lines].join('\r\n');
}

export function ordersSummaryCsv(report: Report): string {
  const header = ['Department', 'Item', 'Ordered', 'Done in-house', 'In-house %', 'In-house revenue'];
  const lines = report.byItem.map((i) => [DEPTS[i.department].label, i.name, i.ordered, i.inHouse, pct(i.inHouse, i.ordered), i.revenue].map(cell).join(','));
  const totals = report.summary.map((s) => [DEPTS[s.department].label, 'Total', s.ordered, s.inHouse, pct(s.inHouse, s.ordered), s.revenue].map(cell).join(','));
  return [header.map(cell).join(','), ...lines, ...totals].join('\r\n');
}

// What doctors prescribed and ordered, and how much of it the clinic's own
// pharmacy, lab and radiology then did -- by department, by item, by
// doctor and line by line, for any date range, exportable as CSV. A doctor
// sees their own orders; a department counter passes `lockTo`.
export function OrdersReport({ lockTo }: { lockTo?: Department } = {}) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const month = presets()[2]!;
  const [from, setFrom] = useState(month.from);
  const [to, setTo] = useState(month.to);
  const [doctorId, setDoctorId] = useState('');
  const [depts, setDepts] = useState<Department[]>(lockTo ? [lockTo] : ALL);
  const [itemsShown, setItemsShown] = useState(15);
  const [rowsShown, setRowsShown] = useState(100);
  const { data: doctors } = useQuery({ queryKey: ['doctors'], queryFn: listDoctors, enabled: isAdmin });
  const { data, isLoading, error } = useQuery({
    queryKey: ['orders-report', from, to, doctorId, depts.join(',')],
    queryFn: () => getOrdersReport({ from, to, doctorId: doctorId || undefined, departments: depts }),
    enabled: !!from && !!to,
  });
  const activePreset = presets().find((p) => p.from === from && p.to === to)?.key;
  const suffix = depts.length === 1 ? `_${DEPTS[depts[0]!].label.toLowerCase()}` : '';

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">From</span>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5" data-testid="orders-from" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">To</span>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5" data-testid="orders-to" />
          </label>
          {isAdmin && doctors && doctors.length > 0 && (
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-700">Doctor</span>
              <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5" data-testid="orders-doctor">
                <option value="">All doctors</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {doctorName(d.user.name)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex gap-1.5">
            {presets().map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  setFrom(p.from);
                  setTo(p.to);
                }}
                className={`rounded-full border px-3 py-1 text-sm ${activePreset === p.key ? 'border-teal bg-teal-light text-teal' : 'border-gray-300 text-gray-600 hover:border-teal hover:text-teal'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              disabled={!data?.byItem.length}
              onClick={() => data && download(`orders_summary${suffix}_${from}_to_${to}.csv`, ordersSummaryCsv(data))}
              className={btnSecondary}
              data-testid="export-orders-summary"
            >
              Export summary
            </button>
            <button
              type="button"
              disabled={!data?.rows.length}
              onClick={() => data && download(`orders${suffix}_${from}_to_${to}.csv`, ordersToCsv(data))}
              className={btnPrimary}
              data-testid="export-orders"
            >
              Export CSV
            </button>
          </div>
        </div>
        {!lockTo && (
          <div className="mt-3 flex flex-wrap gap-1.5 text-sm" role="group" aria-label="Department">
            {[{ key: 'ALL', label: 'All departments', d: ALL }, ...ALL.map((d) => ({ key: d, label: DEPTS[d].label, d: [d] }))].map((o) => {
              const on = o.d.length === depts.length && o.d.every((d) => depts.includes(d));
              return (
                <button
                  key={o.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDepts(o.d)}
                  className={`rounded-lg border px-3 py-1 ${on ? 'border-teal bg-teal text-white' : 'border-gray-300 text-gray-700 hover:border-teal hover:text-teal'}`}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{(error as any).response?.data?.message ?? 'Could not load the report'}</p>}
      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}

      {data && (
        <>
          <div className={`grid gap-4 ${data.summary.length > 1 ? 'md:grid-cols-3' : ''}`}>
            {data.summary.map((s) => (
              <div key={s.department} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm" data-testid={`orders-summary-${s.department}`}>
                <p className="flex items-center gap-2 text-sm font-medium text-gray-600">
                  <Icon name={DEPTS[s.department].icon} className="h-4 w-4 text-teal" /> {WHAT[s.department]}
                </p>
                <p className="mt-2 text-3xl font-semibold text-gray-900">
                  <span data-testid="summary-inhouse">{s.inHouse}</span>
                  <span className="text-lg font-normal text-gray-400"> / {s.ordered}</span>
                </p>
                <p className="text-sm text-gray-500">done in-house ({pct(s.inHouse, s.ordered)}%)</p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100" aria-hidden>
                  <div className="h-full rounded-full bg-teal" style={{ width: `${pct(s.inHouse, s.ordered)}%` }} />
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  {s.substituted > 0 && `${s.substituted} substituted · `}
                  {s.notDone} not done here · {s.pending} pending
                </p>
                <p className="mt-1 text-sm">
                  In-house revenue <span className="font-semibold text-gray-900">{formatMoney(s.revenue)}</span>
                </p>
              </div>
            ))}
          </div>

          {data.byItem.length > 0 && (
            <div className={`grid gap-4 ${isAdmin && data.byDoctor.length > data.summary.length ? 'lg:grid-cols-3' : ''}`}>
              <Card title="By item" subtitle="Most ordered first" className="lg:col-span-2">
                <div className="-mx-5 overflow-x-auto">
                  <table className="w-full text-left text-sm" data-testid="orders-by-item">
                    <thead className="text-xs uppercase tracking-wide text-gray-500">
                      <tr className="border-b border-gray-100">
                        <th className="px-5 py-2 font-medium">Item</th>
                        {depts.length > 1 && <th className="px-2 py-2 font-medium">Department</th>}
                        <th className="px-2 py-2 text-right font-medium">Ordered</th>
                        <th className="px-2 py-2 text-right font-medium">In-house</th>
                        <th className="px-5 py-2 text-right font-medium">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byItem.slice(0, itemsShown).map((i) => (
                        <tr key={`${i.department}:${i.name}`} className="border-b border-gray-50">
                          <td className="px-5 py-1.5 text-gray-900">{i.name}</td>
                          {depts.length > 1 && <td className="px-2 py-1.5 text-gray-500">{DEPTS[i.department].label}</td>}
                          <td className="px-2 py-1.5 text-right">{i.ordered}</td>
                          <td className="px-2 py-1.5 text-right">
                            {i.inHouse} <span className="text-xs text-gray-400">({pct(i.inHouse, i.ordered)}%)</span>
                          </td>
                          <td className="px-5 py-1.5 text-right">{formatMoney(i.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.byItem.length > itemsShown && (
                  <button type="button" onClick={() => setItemsShown(data.byItem.length)} className="mt-3 text-sm text-teal hover:underline">
                    Show all {data.byItem.length} items
                  </button>
                )}
              </Card>
              {isAdmin && data.byDoctor.length > data.summary.length && (
                <Card title="By doctor">
                  <dl className="space-y-2 text-sm">
                    {data.byDoctor.map((d) => (
                      <div key={`${d.doctorId}:${d.department}`} className="flex justify-between gap-2">
                        <dt className="text-gray-600">
                          {doctorName(d.doctorName)} <span className="text-gray-400">· {DEPTS[d.department].label}</span>
                        </dt>
                        <dd className="whitespace-nowrap text-gray-900">
                          {d.inHouse}/{d.ordered} <span className="text-gray-400">({pct(d.inHouse, d.ordered)}%)</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Card>
              )}
            </div>
          )}

          <Card title="Every order" subtitle={`${data.rows.length} line(s) from visits ${formatDate(from)} to ${formatDate(to)}`}>
            {data.rows.length === 0 ? (
              <p className="text-sm text-gray-500">Nothing ordered in this range.</p>
            ) : (
              <div className="-mx-5 overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-sm" data-testid="orders-rows">
                  <thead className="text-xs uppercase tracking-wide text-gray-500">
                    <tr className="border-b border-gray-100">
                      <th className="px-5 py-2 font-medium">Visit</th>
                      <th className="px-2 py-2 font-medium">Patient</th>
                      <th className="px-2 py-2 font-medium">Doctor</th>
                      <th className="px-2 py-2 font-medium">Ordered</th>
                      <th className="px-2 py-2 font-medium">Status</th>
                      <th className="px-2 py-2 font-medium">Done as</th>
                      <th className="px-5 py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.slice(0, rowsShown).map((r, i) => (
                      <tr key={i} className="border-b border-gray-50 align-top" data-testid="orders-row">
                        <td className="whitespace-nowrap px-5 py-2">
                          {formatDate(r.date)}
                          <span className="block text-xs text-gray-400">{DEPTS[r.department].label}</span>
                        </td>
                        <td className="px-2 py-2">
                          {r.patientId ? (
                            <Link to={`/patients/${r.patientId}`} className="font-medium text-gray-900 hover:text-teal hover:underline">
                              {r.patientName}
                            </Link>
                          ) : (
                            r.patientName
                          )}
                          {r.patientCode && <span className="block font-mono text-xs text-gray-400">{r.patientCode}</span>}
                        </td>
                        <td className="px-2 py-2 text-gray-600">{doctorName(r.doctorName)}</td>
                        <td className="max-w-[14rem] px-2 py-2 text-gray-900">{r.ordered}</td>
                        <td className="px-2 py-2">
                          <span className={`whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${STATUS[r.status].tone}`}>{STATUS[r.status].label}</span>
                          {r.note && <span className="mt-0.5 block text-xs text-gray-500">{r.note}</span>}
                        </td>
                        <td className="max-w-[14rem] px-2 py-2 text-gray-600">
                          {r.doneAs ?? '—'}
                          {r.quantity != null && r.department === 'PHARMACY' && <span className="text-gray-400"> × {r.quantity}</span>}
                        </td>
                        <td className="whitespace-nowrap px-5 py-2 text-right">{r.amount ? formatMoney(r.amount) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.rows.length > rowsShown && (
                  <button type="button" onClick={() => setRowsShown((n) => n + 200)} className="mx-5 mt-3 text-sm text-teal hover:underline">
                    Show more ({data.rows.length - rowsShown} more)
                  </button>
                )}
              </div>
            )}
          </Card>
          {user?.role === 'DOCTOR' && (
            <p className="flex items-center gap-1.5 text-xs text-gray-500">
              <Icon name="alert" className="h-3.5 w-3.5" /> Showing your own prescriptions and orders.
            </p>
          )}
        </>
      )}
    </div>
  );
}
