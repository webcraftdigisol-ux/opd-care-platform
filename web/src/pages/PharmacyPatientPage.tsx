import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PharmacyItem, PharmacyOrderLine, PharmacySale } from '@opd/shared';
import { getPharmacyOrders, skipPrescription, unskipPrescription } from '../api/departments';
import { createPharmacySale, listPharmacyItems } from '../api/pharmacy';
import { useAuth } from '../context/AuthContext';
import { Card, EmptyState, btnPrimary, btnSecondary, inputClass } from '../components/ui';
import { Icon } from '../components/Icon';
import { SuggestInput } from '../components/SuggestInput';
import { DeptPatientHeader, ReceiptCreated, SkipDialog, StatusPill } from '../components/DeptParts';
import { formatDate } from '../utils/patientFormat';
import { FOOD_TIMING_OPTIONS, doctorName } from '../utils/visitFormat';
import { money, productLabel } from '../utils/departments';

interface Line {
  key: string;
  prescribed?: PharmacyOrderLine;
  include: boolean;
  itemId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  // Picking a product other than the listed substitutes.
  other: boolean;
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, '');

// Mirrors the server's rule (utils/departments.ts): a different
// composition, or a different brand than the one prescribed.
function isSwap(line: Line, item: PharmacyItem | undefined): boolean {
  const p = line.prescribed;
  if (!p || !line.name.trim()) return false;
  if (!item) return ![p.medicine, p.label].some((n) => n.toLowerCase() === line.name.trim().toLowerCase());
  if (norm(item.name) !== norm(p.medicine)) return true;
  if (p.strength && item.strength && norm(item.strength) !== norm(p.strength)) return true;
  return !!p.brand && norm(item.brand) !== norm(p.brand);
}

const instructions = (l: PharmacyOrderLine) =>
  [
    l.dosage && l.dosage !== '1' ? l.dosage : null,
    l.frequency,
    `${l.durationDays} day${l.durationDays === 1 ? '' : 's'}`,
    FOOD_TIMING_OPTIONS.find((f) => f.value === l.foodTiming)?.label,
  ]
    .filter(Boolean)
    .join(' · ');

// One patient at the pharmacy: the doctor's prescriptions visit by visit.
// Tick what's being handed over, swap in another brand of the same
// composition (or any other medicine) when the prescribed one isn't
// available, adjust quantity and price, and dispense -- which creates the
// receipt. A line not being dispensed here can be marked as such.
export function PharmacyPatientPage() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const { clinic } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ['pharmacy-orders', patientId], queryFn: () => getPharmacyOrders(patientId!) });
  const { data: catalog } = useQuery({ queryKey: ['pharmacy-items'], queryFn: listPharmacyItems });
  const byId = useMemo(() => new Map((catalog ?? []).map((i) => [i.id, i])), [catalog]);
  const byLabel = useMemo(() => new Map((catalog ?? []).map((i) => [productLabel(i).toLowerCase(), i])), [catalog]);
  const labels = useMemo(() => (catalog ?? []).map(productLabel), [catalog]);

  const [lines, setLines] = useState<Line[]>([]);
  const [receipt, setReceipt] = useState<PharmacySale | null>(null);
  const [skipping, setSkipping] = useState<PharmacyOrderLine | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    // Everything still pending, ticked for the latest visit that has any.
    // A refetch (after marking a line "not dispensing", say) keeps the
    // edits already made to the other lines, and any added medicines.
    const firstPending = data.visits.find((v) => v.lines.some((l) => l.status === 'PENDING'))?.appointmentId;
    setLines((prev) => [
      ...data.visits.flatMap((v) =>
        v.lines
          .filter((l) => l.status === 'PENDING')
          .map((l) => {
            const kept = prev.find((p) => p.key === l.prescriptionId);
            return kept
              ? { ...kept, prescribed: l }
              : {
                  key: l.prescriptionId,
                  prescribed: l,
                  include: v.appointmentId === firstPending,
                  itemId: l.match?.id ?? null,
                  name: l.match ? productLabel(l.match) : l.label,
                  quantity: l.suggestedQuantity,
                  unitPrice: l.match?.pricePerUnit ?? 0,
                  other: !l.match,
                };
          }),
      ),
      ...prev.filter((p) => !p.prescribed),
    ]);
  }, [data]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['pharmacy-orders', patientId] });
    queryClient.invalidateQueries({ queryKey: ['dept-queue', 'PHARMACY'] });
    queryClient.invalidateQueries({ queryKey: ['dept-receipts', 'PHARMACY'] });
    queryClient.invalidateQueries({ queryKey: ['pharmacy-items'] });
  };

  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pickProduct = (key: string, item: PharmacyItem | null, typed?: string) =>
    update(key, item ? { itemId: item.id, name: productLabel(item), unitPrice: item.pricePerUnit } : { itemId: null, name: typed ?? '' });

  const chosen = lines.filter((l) => l.include);
  const subtotal = chosen.reduce((n, l) => n + l.quantity * l.unitPrice, 0);
  const tax = Math.round(subtotal * ((clinic?.taxPercent ?? 0) / 100) * 100) / 100;
  const invalid = chosen.some((l) => !l.name.trim() || !(l.quantity > 0) || l.unitPrice < 0);

  const dispense = useMutation({
    mutationFn: () =>
      createPharmacySale({
        patientId: patientId!,
        items: chosen.map((l) => ({
          prescriptionId: l.prescribed?.prescriptionId,
          itemId: l.itemId ?? undefined,
          medicineName: l.name.trim(),
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
      }),
    onSuccess: (sale) => {
      setReceipt(sale);
      setLines((ls) => ls.filter((l) => !l.include));
      setError(null);
      refresh();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not dispense'),
  });
  const skip = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => skipPrescription(id, reason),
    onSuccess: () => {
      setSkipping(null);
      refresh();
    },
  });
  const unskip = useMutation({ mutationFn: unskipPrescription, onSuccess: refresh });

  if (isError) return <div className="px-6 py-10 text-red-600">Could not load this patient.</div>;
  if (isLoading || !data) return <div className="px-6 py-10 text-gray-500">Loading…</div>;

  const lineFor = (id: string) => lines.find((l) => l.key === id);
  const extra = lines.filter((l) => !l.prescribed);

  function renderEditor(l: Line) {
    const item = l.itemId ? byId.get(l.itemId) : undefined;
    const subs = l.prescribed?.substitutes ?? [];
    const swap = isSwap(l, item);
    return (
      <div className={`mt-2 grid gap-2 sm:grid-cols-[1fr_5.5rem_7rem_6.5rem] sm:items-start ${l.include ? '' : 'opacity-50'}`}>
        <div className="min-w-0">
          {subs.length > 0 && !l.other ? (
            <select
              value={l.itemId ?? ''}
              onChange={(e) =>
                e.target.value === '__other' ? update(l.key, { other: true, itemId: null, name: '' }) : pickProduct(l.key, byId.get(e.target.value) ?? null)
              }
              className={inputClass}
              aria-label="Medicine to dispense"
              data-testid={`product-${l.key}`}
            >
              {subs.map((s) => (
                <option key={s.id} value={s.id}>
                  {productLabel(s)} — {s.pricePerUnit > 0 ? `${money(s.pricePerUnit)}/unit` : 'no MRP'}
                  {s.stockUnits > 0 ? ` · ${s.stockUnits} in stock` : ''}
                </option>
              ))}
              <option value="__other">Other medicine…</option>
            </select>
          ) : (
            <div className="flex gap-2">
              <SuggestInput
                value={l.name}
                onChange={(v) => {
                  const hit = byLabel.get(v.toLowerCase());
                  pickProduct(l.key, hit ?? null, v);
                }}
                suggestions={labels}
                placeholder="Type a brand or generic name"
                className={inputClass}
                testId={`product-search-${l.key}`}
              />
              {subs.length > 0 && (
                <button
                  type="button"
                  onClick={() => (update(l.key, { other: false }), pickProduct(l.key, subs[0]!))}
                  className="shrink-0 text-xs text-teal hover:underline"
                >
                  Back to list
                </button>
              )}
            </div>
          )}
          <div className="mt-1 flex flex-wrap gap-1.5">
            {swap && <StatusPill tone="swap">Substitute for {l.prescribed!.label}</StatusPill>}
            {item && item.pricePerUnit === 0 && <StatusPill tone="warn">No MRP set — enter the price</StatusPill>}
            {l.prescribed && !subs.length && !l.itemId && <StatusPill tone="warn">Not in the medicine list</StatusPill>}
          </div>
        </div>
        <label className="text-xs text-gray-500">
          <span className="sm:sr-only">Qty</span>
          <input
            type="number"
            min={1}
            value={l.quantity || ''}
            onChange={(e) => update(l.key, { quantity: Number(e.target.value) })}
            className={inputClass}
            aria-label="Quantity"
            data-testid={`qty-${l.key}`}
          />
        </label>
        <label className="text-xs text-gray-500">
          <span className="sm:sr-only">MRP / unit (₹)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={Number.isNaN(l.unitPrice) ? '' : l.unitPrice}
            onChange={(e) => update(l.key, { unitPrice: Number(e.target.value) })}
            className={inputClass}
            aria-label="Price per unit"
            data-testid={`price-${l.key}`}
          />
        </label>
        <p className="py-2 text-right text-sm font-medium text-gray-900">{money(l.quantity * l.unitPrice || 0)}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-28 sm:px-6">
      <DeptPatientHeader dept="PHARMACY" patient={data.patient} />

      {receipt && (
        <ReceiptCreated dept="PHARMACY" billId={receipt.id} total={receipt.total} count={receipt.items.length} onDone={() => setReceipt(null)} />
      )}

      {!data.visits.length && <EmptyState>No prescriptions for this patient. Add medicines below to sell over the counter.</EmptyState>}

      {data.visits.map((v) => (
        <Card
          key={v.appointmentId}
          title={`Prescription · ${formatDate(v.date)}`}
          subtitle={[doctorName(v.doctorName), v.diagnosis].filter(Boolean).join(' · ')}
          className="mb-5"
        >
          <ul className="divide-y divide-gray-100" data-testid="rx-lines">
            {v.lines.map((p) => {
              const l = lineFor(p.prescriptionId);
              return (
                <li key={p.prescriptionId} className="py-3" data-testid="rx-line">
                  <div className="flex flex-wrap items-start gap-3">
                    {p.status === 'PENDING' && l ? (
                      <input
                        type="checkbox"
                        checked={l.include}
                        onChange={(e) => update(l.key, { include: e.target.checked })}
                        className="mt-1 h-4 w-4 accent-teal"
                        aria-label={`Dispense ${p.label}`}
                        data-testid={`dispense-${p.prescriptionId}`}
                      />
                    ) : (
                      <span className="mt-1 h-4 w-4" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900">{p.label}</p>
                      <p className="text-sm text-gray-500">
                        {instructions(p)}
                        {p.notes ? ` · ${p.notes}` : ''}
                      </p>
                    </div>
                    {p.status === 'DONE' && (
                      <StatusPill tone="done">
                        Dispensed{p.dispensed[0]?.substitutedFor ? ` as ${p.dispensed[0].medicineName}` : ''} · {p.dispensed.reduce((n, d) => n + d.quantity, 0)} units
                      </StatusPill>
                    )}
                    {p.status === 'SKIPPED' && (
                      <span className="flex items-center gap-2">
                        <StatusPill tone="skipped">Not dispensed{p.skipReason ? ` — ${p.skipReason}` : ''}</StatusPill>
                        <button type="button" onClick={() => unskip.mutate(p.prescriptionId)} className="text-xs text-teal hover:underline">
                          Undo
                        </button>
                      </span>
                    )}
                    {p.status === 'PENDING' && (
                      <button type="button" onClick={() => setSkipping(p)} className="text-xs text-gray-500 hover:text-red-600" data-testid={`skip-${p.prescriptionId}`}>
                        Not dispensing
                      </button>
                    )}
                  </div>
                  {p.status === 'PENDING' && l && <div className="pl-7">{renderEditor(l)}</div>}
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      <Card title="Other medicines" subtitle="Anything not on the prescription (over the counter)" className="mb-5">
        {extra.map((l) => (
          <div key={l.key} className="flex items-start gap-2 border-b border-gray-100 pb-2">
            <div className="flex-1">{renderEditor(l)}</div>
            <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="mt-4 text-gray-400 hover:text-red-600" aria-label="Remove">
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLines((ls) => [...ls, { key: `otc-${Date.now()}`, include: true, itemId: null, name: '', quantity: 1, unitPrice: 0, other: true }])}
          className={`${btnSecondary} mt-3`}
          data-testid="add-otc"
        >
          <Icon name="plus" className="h-4 w-4" /> Add medicine
        </button>
      </Card>

      {data.sales.length > 0 && (
        <Card title="Earlier receipts" className="mb-5">
          <ul className="divide-y divide-gray-100 text-sm">
            {data.sales.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="w-40 text-gray-500">{new Date(s.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                <span className="min-w-0 flex-1 truncate">{s.items.map((i) => i.medicineName).join(', ')}</span>
                <span className="font-medium">{money(s.total)}</span>
                <a href={`/receipts/pharmacy/${s.id}`} target="_blank" rel="noreferrer" className="text-teal hover:underline">
                  Receipt
                </a>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-3 gap-y-2">
          <p className="mr-auto text-sm text-gray-600">
            {chosen.length} {chosen.length === 1 ? 'medicine' : 'medicines'} ·{' '}
            <span className="text-base font-semibold text-gray-900" data-testid="dispense-total">
              {money(subtotal + tax)}
            </span>
            {tax > 0 && <span className="text-xs"> incl. {money(tax)} tax</span>}
          </p>
          {error && <p className="w-full text-sm text-red-600 sm:w-auto">{error}</p>}
          <button type="button" onClick={() => navigate('/pharmacy')} className={`${btnSecondary} hidden sm:inline-flex`}>
            Next patient
          </button>
          <button
            type="button"
            onClick={() => dispense.mutate()}
            disabled={!chosen.length || invalid || dispense.isPending}
            className={btnPrimary}
            data-testid="dispense"
          >
            {dispense.isPending ? 'Dispensing…' : 'Dispense & create receipt'}
          </button>
        </div>
      </div>

      {skipping && (
        <SkipDialog
          dept="PHARMACY"
          what={skipping.label}
          busy={skip.isPending}
          onClose={() => setSkipping(null)}
          onConfirm={(reason) => skip.mutate({ id: skipping.prescriptionId, reason })}
        />
      )}
    </div>
  );
}
