import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { BillType, TransactionRow, TransactionsReport } from '@opd/shared';
import { getTransactionsReport } from '../api/reports';
import { listDoctors } from '../api/doctors';
import { useAuth } from '../context/AuthContext';
import { Card, btnPrimary } from './ui';
import { Icon } from './Icon';
import { formatDate, formatMoney } from '../utils/patientFormat';
import { doctorName } from '../utils/visitFormat';
import { localDate } from '../pages/AppointmentsPage';

const TYPE_LABEL: Record<BillType, string> = {
  CONSULTATION: 'Consultation',
  PHARMACY: 'Pharmacy',
  LAB: 'Lab',
  RADIOLOGY: 'Radiology',
  IPD: 'IPD',
};
const STATUS: Record<TransactionRow['status'], { label: string; tone: string }> = {
  PAID: { label: 'Paid', tone: 'bg-emerald-50 text-emerald-700' },
  PARTLY_PAID: { label: 'Part paid', tone: 'bg-amber-50 text-amber-800' },
  UNPAID: { label: 'Unpaid', tone: 'bg-red-50 text-red-700' },
  NO_CHARGE: { label: 'No charge', tone: 'bg-gray-100 text-gray-600' },
};
const METHOD_LABEL: Record<string, string> = { CASH: 'Cash', CARD: 'Card', UPI: 'UPI', NETBANKING: 'Net banking', WALLET: 'Wallet', RAZORPAY: 'Online (Razorpay)' };

function shift(date: string, days: number) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
}

function presets(): { key: string; label: string; from: string; to: string }[] {
  const today = localDate();
  const d = new Date(`${today}T12:00:00`);
  const monday = shift(today, -((d.getDay() + 6) % 7));
  const monthStart = `${today.slice(0, 8)}01`;
  return [
    { key: 'today', label: 'Today', from: today, to: today },
    { key: 'week', label: 'This week', from: monday, to: today },
    { key: 'month', label: 'This month', from: monthStart, to: today },
  ];
}

// A CSV cell: quoted, with inner quotes doubled; formula-looking text is
// prefixed so a spreadsheet doesn't execute it.
function cell(v: string | number | null): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(report: TransactionsReport): string {
  const header = ['Date', 'Time', 'Type', 'Patient', 'Patient ID', 'Doctor', 'Description', 'Status', 'Billed', 'Collected', 'Outstanding'];
  const lines = report.rows.map((r) => {
    const d = new Date(r.date);
    return [
      localDate(d),
      d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      TYPE_LABEL[r.billType],
      r.patientName,
      r.patientCode,
      r.doctorName,
      r.description,
      STATUS[r.status].label,
      r.billed,
      r.collected,
      r.outstanding,
    ]
      .map(cell)
      .join(',');
  });
  const t = report.totals;
  lines.push(['Total', '', '', '', '', '', `${t.count} record(s)`, '', t.billed, t.collected, t.outstanding].map(cell).join(','));
  return [header.map(cell).join(','), ...lines].join('\r\n');
}

function download(filename: string, text: string) {
  // A BOM so Excel opens the ₹-free UTF-8 text with the right encoding.
  const url = URL.createObjectURL(new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// Revenue: every bill in a date range, what was charged and what was
// actually collected, with quick ranges, a doctor filter and CSV export.
export function RevenueReport() {
  const { user, clinic } = useAuth();
  const tier = clinic?.tier ?? 1;
  const available: BillType[] = ['CONSULTATION', ...(tier >= 2 ? (['PHARMACY', 'LAB', 'RADIOLOGY'] as const) : []), ...(tier >= 3 ? (['IPD'] as const) : [])];
  const month = presets()[2]!;
  const [from, setFrom] = useState(month.from);
  const [to, setTo] = useState(month.to);
  const [doctorId, setDoctorId] = useState('');
  const [types, setTypes] = useState<BillType[]>(available);
  const isAdmin = user?.role === 'ADMIN';
  const { data: doctors } = useQuery({ queryKey: ['doctors'], queryFn: listDoctors, enabled: isAdmin });

  const { data, isLoading, error } = useQuery({
    queryKey: ['transactions', from, to, doctorId, types.join(',')],
    queryFn: () => getTransactionsReport({ from, to, doctorId: doctorId || undefined, types }),
    enabled: !!from && !!to && types.length > 0,
  });
  const activePreset = presets().find((p) => p.from === from && p.to === to)?.key;

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">From</span>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5" data-testid="report-from" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">To</span>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5" data-testid="report-to" />
          </label>
          {isAdmin && doctors && doctors.length > 0 && (
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-700">Doctor</span>
              <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5" data-testid="report-doctor">
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
            disabled={!data?.rows.length}
            onClick={() => data && download(`revenue_${from}_to_${to}.csv`, toCsv(data))}
            className={`${btnPrimary} ml-auto`}
            data-testid="export-csv"
          >
            Export CSV
          </button>
        </div>
        {available.length > 1 && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-gray-700">
            <span className="text-gray-500">Include:</span>
            {available.map((t) => (
              <label key={t} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={types.includes(t)}
                  onChange={(e) => setTypes((ts) => (e.target.checked ? [...ts, t] : ts.filter((x) => x !== t)))}
                  className="h-4 w-4 accent-teal"
                />
                {TYPE_LABEL[t]}
              </label>
            ))}
          </div>
        )}
      </Card>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{(error as any).response?.data?.message ?? 'Could not load the report'}</p>}
      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              { label: 'Records', value: String(data.totals.count), tone: 'text-gray-900' },
              { label: 'Billed', value: formatMoney(data.totals.billed), tone: 'text-gray-900' },
              { label: 'Collected', value: formatMoney(data.totals.collected), tone: 'text-teal' },
              { label: 'Outstanding', value: formatMoney(data.totals.outstanding), tone: data.totals.outstanding > 0 ? 'text-red-600' : 'text-gray-900' },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{s.label}</p>
                <p className={`mt-1 text-2xl font-semibold ${s.tone}`} data-testid={`report-${s.label.toLowerCase()}`}>
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          {data.rows.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card title="By day" className="lg:col-span-2">
                <div className="flex flex-wrap gap-2">
                  {data.byDay.map((d) => (
                    <div key={d.date} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                      <p className="font-medium text-gray-900">{formatDate(d.date)}</p>
                      <p className="text-xs text-gray-500">
                        {d.count} · {formatMoney(d.billed)} billed · {formatMoney(d.collected)} in
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
              <Card title="By type & payment mode">
                <dl className="space-y-1.5 text-sm">
                  {data.byType.map((t) => (
                    <div key={t.billType} className="flex justify-between gap-2">
                      <dt className="text-gray-600">
                        {TYPE_LABEL[t.billType]} ({t.count})
                      </dt>
                      <dd className="text-gray-900">
                        {formatMoney(t.billed)} <span className="text-gray-400">/ {formatMoney(t.collected)}</span>
                      </dd>
                    </div>
                  ))}
                  {data.byMethod.length > 0 && <div className="my-2 border-t border-gray-100" />}
                  {data.byMethod.map((m) => (
                    <div key={m.method} className="flex justify-between gap-2">
                      <dt className="text-gray-600">{METHOD_LABEL[m.method] ?? m.method}</dt>
                      <dd className="text-gray-900">{formatMoney(m.amount)}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            </div>
          )}

          <Card title="Transactions" subtitle={`${data.totals.count} record(s) from ${formatDate(from)} to ${formatDate(to)}`}>
            {data.rows.length === 0 ? (
              <p className="text-sm text-gray-500">Nothing billed in this range.</p>
            ) : (
              <div className="-mx-5 overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-sm" data-testid="transactions">
                  <thead className="text-xs uppercase tracking-wide text-gray-500">
                    <tr className="border-b border-gray-100">
                      <th className="px-5 py-2 font-medium">Date</th>
                      <th className="px-2 py-2 font-medium">Type</th>
                      <th className="px-2 py-2 font-medium">Patient</th>
                      <th className="px-2 py-2 font-medium">Doctor</th>
                      <th className="px-2 py-2 font-medium">Description</th>
                      <th className="px-2 py-2 font-medium">Status</th>
                      <th className="px-2 py-2 text-right font-medium">Billed</th>
                      <th className="px-5 py-2 text-right font-medium">Collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={`${r.billType}:${r.billId}`} className="border-b border-gray-50 align-top">
                        <td className="whitespace-nowrap px-5 py-2">
                          {formatDate(r.date)}
                          <span className="block text-xs text-gray-400">{new Date(r.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                        </td>
                        <td className="px-2 py-2">{TYPE_LABEL[r.billType]}</td>
                        <td className="px-2 py-2">
                          {r.patientId ? (
                            <Link to={`/patients/${r.patientId}?tab=billing`} className="font-medium text-gray-900 hover:text-teal hover:underline">
                              {r.patientName}
                            </Link>
                          ) : (
                            r.patientName
                          )}
                          {r.patientCode && <span className="block font-mono text-xs text-gray-400">{r.patientCode}</span>}
                        </td>
                        <td className="px-2 py-2 text-gray-600">{r.doctorName ? doctorName(r.doctorName) : '—'}</td>
                        <td className="max-w-[16rem] px-2 py-2 text-gray-600">{r.description}</td>
                        <td className="px-2 py-2">
                          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS[r.status].tone}`}>{STATUS[r.status].label}</span>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right">{formatMoney(r.billed)}</td>
                        <td className="whitespace-nowrap px-5 py-2 text-right">
                          {formatMoney(r.collected)}
                          {r.outstanding > 0 && <span className="block text-xs text-red-600">{formatMoney(r.outstanding)} due</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          {!isAdmin && (
            <p className="flex items-center gap-1.5 text-xs text-gray-500">
              <Icon name="alert" className="h-3.5 w-3.5" /> Showing your own patients' bills.
            </p>
          )}
        </>
      )}
    </div>
  );
}
