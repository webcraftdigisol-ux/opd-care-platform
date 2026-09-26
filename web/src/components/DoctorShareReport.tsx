import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DoctorShareReport as Report, ProfitShareRate, ShareDepartment } from '@opd/shared';
import { getDoctorShare, getProfitShareRates, saveProfitShareRates } from '../api/reports';
import { listDoctors } from '../api/doctors';
import { useAuth } from '../context/AuthContext';
import { Card, btnPrimary } from './ui';
import { Icon } from './Icon';
import { cell, download, presets } from './RevenueReport';
import { formatMoney } from '../utils/patientFormat';
import { doctorName } from '../utils/visitFormat';
import { DEPTS } from '../utils/departments';

const DEPARTMENTS: ShareDepartment[] = ['PHARMACY', 'LAB', 'RADIOLOGY'];

export function doctorShareCsv(r: Report): string {
  const row = (vs: (string | number | null)[]) => vs.map(cell).join(',');
  return [
    row([`Doctor share ${r.from} to ${r.to}`]),
    row(['Doctor', 'Department', 'Revenue', 'Cost', 'Profit', 'Share %', "Doctor's share"]),
    ...r.rows.map((x) => row([x.doctorName, DEPTS[x.department].label, x.revenue, x.cost, x.profit, x.doctorId ? x.percent : '', x.doctorId ? x.share : ''])),
    row(['Total', '', r.totals.revenue, r.totals.cost, r.totals.profit, '', r.totals.share]),
  ].join('\r\n');
}

// The doctors' share of the profit the in-house pharmacy, lab and radiology
// make from their patients (OPD and IPD), at the admin-set percentages:
// revenue, cost, profit and share per doctor and department, with CSV.
// Admin also sets the percentages here; a doctor sees their own.
export function DoctorShareReport() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const month = presets()[2]!;
  const [from, setFrom] = useState(month.from);
  const [to, setTo] = useState(month.to);
  const { data, isLoading, error } = useQuery({ queryKey: ['doctor-share', from, to], queryFn: () => getDoctorShare(from, to), enabled: !!from && !!to });
  const activePreset = presets().find((p) => p.from === from && p.to === to)?.key;
  const doctorIds = [...new Set((data?.rows ?? []).map((r) => r.doctorId ?? ''))];

  return (
    <div className="space-y-5">
      {isAdmin && <ShareRatesEditor />}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">From</span>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">To</span>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5" />
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
            disabled={!data?.rows.length}
            onClick={() => data && download(`doctor_share_${from}_to_${to}.csv`, doctorShareCsv(data))}
            className={`${btnPrimary} ml-auto`}
            data-testid="export-doctor-share"
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
              { label: 'Total revenue', value: data.totals.revenue, tone: 'text-gray-900' },
              { label: 'Total cost', value: data.totals.cost, tone: 'text-gray-900' },
              { label: 'Profit', value: data.totals.profit, tone: data.totals.profit < 0 ? 'text-red-600' : 'text-gray-900' },
              { label: isAdmin ? "Doctors' share" : 'Your share', value: data.totals.share, tone: 'text-teal' },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{s.label}</p>
                <p className={`mt-1 text-2xl font-semibold ${s.tone}`} data-testid={`share-${s.label.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
                  {formatMoney(s.value)}
                </p>
              </div>
            ))}
          </div>

          <Card title="By doctor" subtitle="Pharmacy, laboratory and radiology bills for each doctor's patients, OPD and IPD, before tax">
            {data.rows.length === 0 ? (
              <p className="text-sm text-gray-500">Nothing sold in these dates.</p>
            ) : (
              <div className="-mx-5 overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm" data-testid="doctor-share">
                  <thead className="text-xs uppercase tracking-wide text-gray-500">
                    <tr className="border-b border-gray-100">
                      <th className="px-5 py-2 font-medium">Doctor</th>
                      <th className="px-2 py-2 font-medium">Department</th>
                      <th className="px-2 py-2 text-right font-medium">Revenue</th>
                      <th className="px-2 py-2 text-right font-medium">Cost</th>
                      <th className="px-2 py-2 text-right font-medium">Profit</th>
                      <th className="px-2 py-2 text-right font-medium">Share %</th>
                      <th className="px-5 py-2 text-right font-medium">Doctor's share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doctorIds.map((id) => {
                      const rows = data.rows.filter((r) => (r.doctorId ?? '') === id);
                      const sub = (k: 'revenue' | 'cost' | 'profit' | 'share') => rows.reduce((n, r) => n + r[k], 0);
                      return [
                        ...rows.map((r, i) => (
                          <tr key={`${id}:${r.department}`} className="border-b border-gray-50" data-testid="share-row">
                            <td className="px-5 py-2 font-medium text-gray-900">{i === 0 ? (r.doctorId ? doctorName(r.doctorName) : r.doctorName) : ''}</td>
                            <td className="px-2 py-2 text-gray-600">{DEPTS[r.department].label}</td>
                            <td className="px-2 py-2 text-right">{formatMoney(r.revenue)}</td>
                            <td className="px-2 py-2 text-right text-gray-600">{formatMoney(r.cost)}</td>
                            <td className={`px-2 py-2 text-right ${r.profit < 0 ? 'text-red-600' : ''}`}>{formatMoney(r.profit)}</td>
                            <td className="px-2 py-2 text-right text-gray-600">{r.doctorId ? `${r.percent}%` : '—'}</td>
                            <td className="px-5 py-2 text-right font-semibold text-teal">{r.doctorId ? formatMoney(r.share) : '—'}</td>
                          </tr>
                        )),
                        rows.length > 1 && id ? (
                          <tr key={`${id}:total`} className="border-b border-gray-100 bg-gray-50 text-sm font-medium">
                            <td className="px-5 py-1.5" />
                            <td className="px-2 py-1.5 text-gray-500">Subtotal</td>
                            <td className="px-2 py-1.5 text-right">{formatMoney(sub('revenue'))}</td>
                            <td className="px-2 py-1.5 text-right">{formatMoney(sub('cost'))}</td>
                            <td className="px-2 py-1.5 text-right">{formatMoney(sub('profit'))}</td>
                            <td />
                            <td className="px-5 py-1.5 text-right text-teal">{formatMoney(sub('share'))}</td>
                          </tr>
                        ) : null,
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-gray-500">
              Profit is revenue minus the cost in the medicine / test lists. The share is that percentage of a profit (nothing on a loss). Sales not linked
              to a doctor (over the counter) earn no share.
            </p>
          </Card>
          {!isAdmin && (
            <p className="flex items-center gap-1.5 text-xs text-gray-500">
              <Icon name="alert" className="h-3.5 w-3.5" /> Showing your own patients. The percentages are set by the clinic admin.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// Admin: the clinic's default share per department, and any doctor's own.
function ShareRatesEditor() {
  const queryClient = useQueryClient();
  const { data: rates } = useQuery({ queryKey: ['profit-share-rates'], queryFn: getProfitShareRates });
  const { data: doctors } = useQuery({ queryKey: ['doctors'], queryFn: listDoctors });
  const [open, setOpen] = useState(false);
  // key `${doctorId ?? 'default'}:${department}` -> the typed value ('' = not set)
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const key = (doctorId: string | null, d: ShareDepartment) => `${doctorId ?? 'default'}:${d}`;
  useEffect(() => {
    if (rates) setValues(Object.fromEntries(rates.map((r: ProfitShareRate) => [key(r.doctorId, r.department), String(r.percent)])));
  }, [rates]);
  const save = useMutation({
    mutationFn: () =>
      saveProfitShareRates(
        [null, ...(doctors ?? []).map((d) => d.id)].flatMap((doctorId) =>
          DEPARTMENTS.map((department) => {
            const v = values[key(doctorId, department)]?.trim() ?? '';
            return { doctorId, department, percent: v === '' ? (doctorId ? null : 0) : Number(v) };
          }),
        ),
      ),
    onSuccess: () => {
      setSaved(true);
      queryClient.invalidateQueries({ queryKey: ['profit-share-rates'] });
      queryClient.invalidateQueries({ queryKey: ['doctor-share'] });
    },
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setSaved(false);
    setValues((v) => ({ ...v, [k]: e.target.value }));
  };
  const invalid = Object.values(values).some((v) => v.trim() !== '' && !(Number(v) >= 0 && Number(v) <= 100));

  return (
    <Card
      title="Doctor profit share %"
      subtitle="The doctor's share of the profit on their patients' pharmacy, lab and radiology bills"
      actions={
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-sm text-teal hover:underline" data-testid="edit-share-rates">
          {open ? 'Hide' : 'Edit percentages'}
        </button>
      }
    >
      {open && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-gray-500">
                <tr className="border-b border-gray-100">
                  <th className="px-5 py-2 font-medium">Who</th>
                  {DEPARTMENTS.map((d) => (
                    <th key={d} className="px-2 py-2 font-medium">
                      {DEPTS[d].label} %
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[{ id: null as string | null, name: 'Clinic default (all doctors)' }, ...(doctors ?? []).map((d) => ({ id: d.id, name: doctorName(d.user.name) }))].map((row) => (
                  <tr key={row.id ?? 'default'} className={`border-b border-gray-50 ${row.id ? '' : 'bg-teal-light/40 font-medium'}`}>
                    <td className="px-5 py-2">{row.name}</td>
                    {DEPARTMENTS.map((d) => (
                      <td key={d} className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.5"
                          value={values[key(row.id, d)] ?? ''}
                          onChange={set(key(row.id, d))}
                          placeholder={row.id ? `${values[key(null, d)] || 0} (default)` : '0'}
                          className="w-36 rounded-lg border border-gray-300 px-2 py-1"
                          aria-label={`${row.name} ${DEPTS[d].label} %`}
                          data-testid={`rate-${row.id ?? 'default'}-${d}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button type="submit" disabled={save.isPending || invalid} className={btnPrimary} data-testid="save-share-rates">
              Save percentages
            </button>
            {saved && <span className="text-sm text-teal">Saved</span>}
            {invalid && <span className="text-sm text-red-600">Each percentage must be between 0 and 100.</span>}
          </div>
          <p className="mt-2 text-xs text-gray-500">Leave a doctor's box empty to use the clinic default.</p>
        </form>
      )}
    </Card>
  );
}
