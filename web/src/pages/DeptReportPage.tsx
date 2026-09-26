import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Department, DepartmentReport } from '@opd/shared';
import { getDepartmentReport } from '../api/reports';
import { DeptTabs } from '../components/DeptTabs';
import { Card, btnPrimary } from '../components/ui';
import { cell, download, presets } from '../components/RevenueReport';
import { formatDate, formatMoney } from '../utils/patientFormat';
import { DEPTS } from '../utils/departments';

export function departmentCsv(r: DepartmentReport): string {
  const row = (vs: (string | number | null)[]) => vs.map(cell).join(',');
  const lines = [
    row(['Date', 'Time', 'Receipt', 'OPD/IPD', 'Patient', 'Patient ID', 'Doctor', 'Item', 'Qty', 'Rate', 'Revenue', 'Cost', 'Profit']),
    ...r.lines.map((l) => {
      const d = new Date(l.date);
      return row([
        d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
        d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }),
        l.receiptNo,
        l.setting,
        l.patientName,
        l.patientCode,
        l.doctorName,
        l.item,
        l.quantity,
        l.unitPrice,
        l.revenue,
        l.cost,
        l.profit,
      ]);
    }),
    row(['Total', '', '', '', '', '', '', '', '', '', r.totals.revenue, r.totals.cost, r.totals.profit]),
  ];
  return lines.join('\r\n');
}

const margin = (profit: number, revenue: number) => (revenue ? `${Math.round((profit / revenue) * 100)}%` : '—');

// A department's own report: everything it sold in the chosen dates, line
// by line, with revenue, cost and profit -- by day and by item too -- and
// CSV export.
export function DeptReportPage({ dept }: { dept: Department }) {
  const info = DEPTS[dept];
  const month = presets()[2]!;
  const [from, setFrom] = useState(month.from);
  const [to, setTo] = useState(month.to);
  const [itemsShown, setItemsShown] = useState(10);
  const [linesShown, setLinesShown] = useState(100);
  const { data, isLoading, error } = useQuery({
    queryKey: ['dept-report', dept, from, to],
    queryFn: () => getDepartmentReport(dept, from, to),
    enabled: !!from && !!to,
  });
  const activePreset = presets().find((p) => p.from === from && p.to === to)?.key;
  const estimated = data?.lines.some((l) => l.costEstimated);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <DeptTabs dept={dept} />
      <div className="space-y-5">
        <Card>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-700">From</span>
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5" data-testid="dept-report-from" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-gray-700">To</span>
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5" data-testid="dept-report-to" />
            </label>
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
              disabled={!data?.lines.length}
              onClick={() => data && download(`${info.label.toLowerCase()}_report_${from}_to_${to}.csv`, departmentCsv(data))}
              className={`${btnPrimary} ml-auto`}
              data-testid="export-dept-report"
            >
              Export CSV
            </button>
          </div>
        </Card>

        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{(error as any).response?.data?.message ?? 'Could not load the report'}</p>}
        {isLoading && <p className="text-sm text-gray-500">Loading…</p>}

        {data && (
          <>
            <div className="grid gap-4 sm:grid-cols-4">
              {[
                { label: 'Revenue', value: formatMoney(data.totals.revenue), tone: 'text-gray-900' },
                { label: 'Cost', value: formatMoney(data.totals.cost), tone: 'text-gray-900' },
                { label: 'Profit', value: formatMoney(data.totals.profit), tone: data.totals.profit < 0 ? 'text-red-600' : 'text-teal' },
                { label: 'Margin', value: margin(data.totals.profit, data.totals.revenue), tone: 'text-gray-900' },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{s.label}</p>
                  <p className={`mt-1 text-2xl font-semibold ${s.tone}`} data-testid={`dept-report-${s.label.toLowerCase()}`}>
                    {s.value}
                  </p>
                </div>
              ))}
            </div>

            {data.lines.length > 0 && (
              <div className="grid gap-4 lg:grid-cols-2">
                <Card title="By day">
                  <Table
                    head={['Date', 'Revenue', 'Cost', 'Profit']}
                    rows={data.byDay.map((d) => [formatDate(d.date), formatMoney(d.revenue), formatMoney(d.cost), formatMoney(d.profit)])}
                  />
                </Card>
                <Card title={`By ${info.item}`} subtitle="Highest revenue first">
                  <Table
                    head={[info.item === 'medicine' ? 'Medicine' : 'Test', 'Qty', 'Revenue', 'Profit']}
                    rows={data.byItem.slice(0, itemsShown).map((i) => [i.item, String(i.quantity), formatMoney(i.revenue), formatMoney(i.profit)])}
                  />
                  {data.byItem.length > itemsShown && (
                    <button type="button" onClick={() => setItemsShown(data.byItem.length)} className="mt-3 text-sm text-teal hover:underline">
                      Show all {data.byItem.length}
                    </button>
                  )}
                </Card>
              </div>
            )}

            <Card title={info.dept === 'PHARMACY' ? 'Medicines dispensed' : 'Tests done'} subtitle={`${formatDate(from)} to ${formatDate(to)}`}>
              {data.lines.length === 0 ? (
                <p className="text-sm text-gray-500">Nothing in these dates.</p>
              ) : (
                <div className="-mx-5 overflow-x-auto">
                  <table className="w-full min-w-[860px] text-left text-sm" data-testid="dept-report-lines">
                    <thead className="text-xs uppercase tracking-wide text-gray-500">
                      <tr className="border-b border-gray-100">
                        <th className="px-5 py-2 font-medium">Date</th>
                        <th className="px-2 py-2 font-medium">Patient</th>
                        <th className="px-2 py-2 font-medium">{info.item === 'medicine' ? 'Medicine' : 'Test'}</th>
                        <th className="px-2 py-2 text-right font-medium">Qty</th>
                        <th className="px-2 py-2 text-right font-medium">Revenue</th>
                        <th className="px-2 py-2 text-right font-medium">Cost</th>
                        <th className="px-5 py-2 text-right font-medium">Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lines.slice(0, linesShown).map((l, i) => (
                        <tr key={i} className="border-b border-gray-50 align-top" data-testid="dept-report-line">
                          <td className="whitespace-nowrap px-5 py-2">
                            {formatDate(l.date)}
                            <span className="block text-xs text-gray-400">
                              {l.receiptNo}
                              {l.setting === 'IPD' && ' · IPD'}
                            </span>
                          </td>
                          <td className="px-2 py-2">
                            {l.patientName}
                            {l.patientCode && <span className="block font-mono text-xs text-gray-400">{l.patientCode}</span>}
                          </td>
                          <td className="max-w-[18rem] px-2 py-2">{l.item}</td>
                          <td className="px-2 py-2 text-right">{l.quantity}</td>
                          <td className="px-2 py-2 text-right">{formatMoney(l.revenue)}</td>
                          <td className="px-2 py-2 text-right text-gray-600">
                            {formatMoney(l.cost)}
                            {l.costEstimated && <span title="Cost not recorded at the time; today's list cost"> *</span>}
                          </td>
                          <td className={`px-5 py-2 text-right font-medium ${l.profit < 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatMoney(l.profit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.lines.length > linesShown && (
                    <button type="button" onClick={() => setLinesShown((n) => n + 200)} className="mx-5 mt-3 text-sm text-teal hover:underline">
                      Show more ({data.lines.length - linesShown} more)
                    </button>
                  )}
                </div>
              )}
              <p className="mt-3 text-xs text-gray-500">
                Revenue is before tax. Cost comes from the {info.listTitle.toLowerCase()} at the time of sale
                {estimated ? '; * marks older sales where today’s cost is used' : ''}.
              </p>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-gray-500">
          <tr className="border-b border-gray-100">
            {head.map((h, i) => (
              <th key={h} className={`py-2 font-medium ${i === 0 ? 'px-5' : 'px-2 text-right'} ${i === head.length - 1 ? 'pr-5' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, j) => (
            <tr key={j} className="border-b border-gray-50">
              {r.map((c, i) => (
                <td key={i} className={`py-1.5 ${i === 0 ? 'px-5' : 'px-2 text-right'} ${i === r.length - 1 ? 'pr-5' : ''}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
