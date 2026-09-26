import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Department, DeptRevenue, OrdersReport as Report, RevenueDepartment } from '@opd/shared';
import { getOrdersReport } from '../api/reports';
import { listDoctors } from '../api/doctors';
import { useAuth } from '../context/AuthContext';
import { Card, btnPrimary } from './ui';
import { Icon } from './Icon';
import { cell, download, presets } from './RevenueReport';
import { formatDate, formatMoney } from '../utils/patientFormat';
import { doctorName } from '../utils/visitFormat';

export const DEPT_LABEL: Record<RevenueDepartment, string> = {
  CONSULTATION: 'Consultation',
  PHARMACY: 'Pharmacy',
  LAB: 'Laboratory',
  RADIOLOGY: 'Radiology',
};
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
const sum = (cs: DeptRevenue[], k: 'ordered' | 'inHouse' | 'notInHouse') => Math.round(cs.reduce((n, c) => n + c[k], 0) * 100) / 100;

// One CSV with three blocks: by department, by day, by doctor.
export function ordersToCsv(report: Report): string {
  const row = (vs: (string | number | null)[]) => vs.map(cell).join(',');
  const depts = report.departments.map((d) => DEPT_LABEL[d]);
  const lines = [
    row([`In-house revenue ${report.from} to ${report.to}`]),
    '',
    row(['Department', 'Prescribed / ordered (₹)', 'Done in-house (₹)', 'Not done in-house (₹)', 'In-house %']),
    ...report.summary.map((c) => row([DEPT_LABEL[c.department], c.ordered, c.inHouse, c.notInHouse, pct(c.inHouse, c.ordered)])),
    row(['Total', sum(report.summary, 'ordered'), sum(report.summary, 'inHouse'), sum(report.summary, 'notInHouse'), pct(sum(report.summary, 'inHouse'), sum(report.summary, 'ordered'))]),
    '',
    row(['In-house revenue by day (₹)', ...depts, 'Total']),
    ...report.byDay.map((d) => row([d.date, ...d.cells.map((c) => c.inHouse), sum(d.cells, 'inHouse')])),
  ];
  if (report.byDoctor.length) {
    lines.push('', row(['In-house revenue by doctor (₹)', ...depts, 'Total']));
    lines.push(...report.byDoctor.map((d) => row([d.doctorName, ...d.cells.map((c) => c.inHouse), sum(d.cells, 'inHouse')])));
  }
  return lines.join('\r\n');
}

// In-house revenue, department by department: consultation fees, and for
// pharmacy, laboratory and radiology the value of what the doctors
// prescribed/ordered against what the clinic's own departments earned from
// it -- for any date range, by day and by doctor, exportable as CSV. A
// doctor sees their own patients; a department counter passes `lockTo`.
export function OrdersReport({ lockTo }: { lockTo?: Department } = {}) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const month = presets()[2]!;
  const [from, setFrom] = useState(month.from);
  const [to, setTo] = useState(month.to);
  const [doctorId, setDoctorId] = useState('');
  const { data: doctors } = useQuery({ queryKey: ['doctors'], queryFn: listDoctors, enabled: isAdmin });
  const { data, isLoading, error } = useQuery({
    queryKey: ['orders-report', from, to, doctorId],
    queryFn: () => getOrdersReport({ from, to, doctorId: doctorId || undefined }),
    enabled: !!from && !!to,
  });
  const activePreset = presets().find((p) => p.from === from && p.to === to)?.key;
  const hasUnpriced = data?.summary.some((c) => c.hasUnpriced);

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
          <button
            type="button"
            disabled={!data}
            onClick={() => data && download(`inhouse_revenue_${from}_to_${to}.csv`, ordersToCsv(data))}
            className={`${btnPrimary} ml-auto`}
            data-testid="export-orders"
          >
            Export CSV
          </button>
        </div>
      </Card>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{(error as any).response?.data?.message ?? 'Could not load the report'}</p>}
      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}

      {data && (
        <>
          <Card title="By department" subtitle={`Visits from ${formatDate(from)} to ${formatDate(to)}`}>
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm" data-testid="orders-by-department">
                <thead className="text-xs uppercase tracking-wide text-gray-500">
                  <tr className="border-b border-gray-100">
                    <th className="px-5 py-2 font-medium">Department</th>
                    <th className="px-2 py-2 text-right font-medium">Prescribed / ordered</th>
                    <th className="px-2 py-2 text-right font-medium">Done in-house</th>
                    <th className="px-2 py-2 text-right font-medium">Not done in-house</th>
                    <th className="w-44 px-5 py-2 font-medium">In-house share</th>
                  </tr>
                </thead>
                <tbody>
                  {data.summary.map((c) => (
                    <tr key={c.department} className="border-b border-gray-50" data-testid={`orders-dept-${c.department}`}>
                      <td className="px-5 py-2.5 font-medium text-gray-900">{DEPT_LABEL[c.department]}</td>
                      <td className="px-2 py-2.5 text-right">{formatMoney(c.ordered)}</td>
                      <td className="px-2 py-2.5 text-right font-semibold text-teal" data-testid="dept-inhouse">
                        {formatMoney(c.inHouse)}
                      </td>
                      <td className="px-2 py-2.5 text-right text-gray-600" data-testid="dept-not-inhouse">
                        {c.department === 'CONSULTATION' ? '—' : formatMoney(c.notInHouse)}
                      </td>
                      <td className="px-5 py-2.5">
                        <Share value={c.inHouse} of={c.ordered} />
                      </td>
                    </tr>
                  ))}
                  {data.summary.length > 1 && (
                    <tr className="font-semibold text-gray-900" data-testid="orders-total">
                      <td className="px-5 py-2.5">Total</td>
                      <td className="px-2 py-2.5 text-right">{formatMoney(sum(data.summary, 'ordered'))}</td>
                      <td className="px-2 py-2.5 text-right text-teal">{formatMoney(sum(data.summary, 'inHouse'))}</td>
                      <td className="px-2 py-2.5 text-right">{formatMoney(sum(data.summary, 'notInHouse'))}</td>
                      <td className="px-5 py-2.5">
                        <Share value={sum(data.summary, 'inHouse')} of={sum(data.summary, 'ordered')} />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Done in-house is what was billed for the doctor's orders (before tax). Not done in-house — pending or taken elsewhere — is valued at today's
              list price.
              {hasUnpriced && ' Some items not done in-house have no price in the list, so their value isn’t included.'}
            </p>
          </Card>

          <RevenueTable title="In-house revenue by day" first="Date" report={data} rows={data.byDay.map((d) => ({ key: d.date, label: formatDate(d.date), cells: d.cells }))} />
          {isAdmin && !doctorId && data.byDoctor.length > 1 && (
            <RevenueTable
              title="In-house revenue by doctor"
              first="Doctor"
              report={data}
              rows={data.byDoctor.map((d) => ({ key: d.doctorId, label: doctorName(d.doctorName), cells: d.cells }))}
            />
          )}

          {(user?.role === 'DOCTOR' || lockTo) && (
            <p className="flex items-center gap-1.5 text-xs text-gray-500">
              <Icon name="alert" className="h-3.5 w-3.5" /> {lockTo ? `Showing ${DEPT_LABEL[lockTo].toLowerCase()} only.` : 'Showing your own patients.'}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Share({ value, of }: { value: number; of: number }) {
  const p = pct(value, of);
  return (
    <span className="flex items-center gap-2">
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100" aria-hidden>
        <span className="block h-full rounded-full bg-teal" style={{ width: `${p}%` }} />
      </span>
      <span className="w-10 text-right text-xs text-gray-600">{of ? `${p}%` : '—'}</span>
    </span>
  );
}

function RevenueTable({ title, first, report, rows }: { title: string; first: string; report: Report; rows: { key: string; label: string; cells: DeptRevenue[] }[] }) {
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Nothing in this range.</p>
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-gray-500">
              <tr className="border-b border-gray-100">
                <th className="px-5 py-2 font-medium">{first}</th>
                {report.departments.map((d) => (
                  <th key={d} className="px-2 py-2 text-right font-medium">
                    {DEPT_LABEL[d]}
                  </th>
                ))}
                {report.departments.length > 1 && <th className="px-5 py-2 text-right font-medium">Total</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-gray-50">
                  <td className="whitespace-nowrap px-5 py-2 text-gray-900">{r.label}</td>
                  {r.cells.map((c) => (
                    <td key={c.department} className="px-2 py-2 text-right">
                      {c.inHouse ? formatMoney(c.inHouse) : <span className="text-gray-300">—</span>}
                    </td>
                  ))}
                  {report.departments.length > 1 && <td className="px-5 py-2 text-right font-medium">{formatMoney(sum(r.cells, 'inHouse'))}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
