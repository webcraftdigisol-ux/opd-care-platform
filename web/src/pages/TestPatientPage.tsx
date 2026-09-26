import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LabInvoice, TestOrderLine } from '@opd/shared';
import { createTestInvoice, getTestOrders, listTestCatalog, saveTestResult, skipTestOrder, unskipTestOrder, type TestDept } from '../api/departments';
import { useAuth } from '../context/AuthContext';
import { Card, EmptyState, btnPrimary, btnSecondary, inputClass } from '../components/ui';
import { Icon } from '../components/Icon';
import { SuggestInput } from '../components/SuggestInput';
import { AttachmentPanel } from '../components/AttachmentPanel';
import { DeptPatientHeader, ReceiptCreated, SkipDialog, StatusPill } from '../components/DeptParts';
import { formatDate } from '../utils/patientFormat';
import { doctorName } from '../utils/visitFormat';
import { DEPTS, money } from '../utils/departments';

interface Line {
  key: string;
  ordered?: TestOrderLine;
  include: boolean;
  catalogItemId: string | null;
  name: string;
  price: number;
}

// One patient at the lab or radiology counter: the tests the doctor
// ordered, visit by visit. Tick what's being done, swap in the matching
// test from the list when the doctor's wording differs (or another test),
// set the price, and mark done -- which creates the receipt. Results and
// report files go in below, now or once they're ready.
export function TestPatientPage({ dept }: { dept: TestDept }) {
  const deptKey = dept === 'lab' ? 'LAB' : 'RADIOLOGY';
  const info = DEPTS[deptKey];
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const { clinic } = useAuth();
  const queryClient = useQueryClient();
  const ordersKey = ['test-orders', dept, patientId];
  const { data, isLoading, isError } = useQuery({ queryKey: ordersKey, queryFn: () => getTestOrders(dept, patientId!) });
  const { data: catalog } = useQuery({ queryKey: ['test-catalog', dept], queryFn: () => listTestCatalog(dept) });
  const byName = useMemo(() => new Map((catalog ?? []).map((c) => [c.name.toLowerCase(), c])), [catalog]);

  const [lines, setLines] = useState<Line[]>([]);
  const [receipt, setReceipt] = useState<LabInvoice | null>(null);
  const [skipping, setSkipping] = useState<TestOrderLine | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    // Keeps edits to other lines, and added tests, across a refetch.
    const firstPending = data.visits.find((v) => v.lines.some((l) => l.status === 'PENDING'))?.appointmentId;
    setLines((prev) => [
      ...data.visits.flatMap((v) =>
        v.lines
          .filter((l) => l.status === 'PENDING')
          .map((l) => {
            const kept = prev.find((p) => p.key === l.orderId);
            return kept
              ? { ...kept, ordered: l }
              : {
                  key: l.orderId,
                  ordered: l,
                  include: v.appointmentId === firstPending,
                  catalogItemId: l.match?.id ?? null,
                  name: l.match?.name ?? l.testName,
                  price: l.match?.price ?? 0,
                };
          }),
      ),
      ...prev.filter((p) => !p.ordered),
    ]);
  }, [data]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ordersKey });
    queryClient.invalidateQueries({ queryKey: ['dept-queue', deptKey] });
    queryClient.invalidateQueries({ queryKey: ['dept-receipts', deptKey] });
  };
  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const chosen = lines.filter((l) => l.include);
  const subtotal = chosen.reduce((n, l) => n + (l.price || 0), 0);
  const tax = Math.round(subtotal * ((clinic?.taxPercent ?? 0) / 100) * 100) / 100;

  const markDone = useMutation({
    mutationFn: () =>
      createTestInvoice(dept, {
        patientId: patientId!,
        items: chosen.map((l) => ({ orderId: l.ordered?.orderId, catalogItemId: l.catalogItemId ?? undefined, testName: l.name.trim(), price: l.price || 0 })),
      }),
    onSuccess: (inv) => {
      setReceipt(inv);
      setLines((ls) => ls.filter((l) => !l.include));
      setError(null);
      refresh();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not save'),
  });
  const skip = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => skipTestOrder(dept, id, reason),
    onSuccess: () => {
      setSkipping(null);
      refresh();
    },
  });
  const unskip = useMutation({ mutationFn: (id: string) => unskipTestOrder(dept, id), onSuccess: refresh });

  if (isError) return <div className="px-6 py-10 text-red-600">Could not load this patient.</div>;
  if (isLoading || !data) return <div className="px-6 py-10 text-gray-500">Loading…</div>;

  const lineFor = (id: string) => lines.find((l) => l.key === id);
  const extra = lines.filter((l) => !l.ordered);

  function renderEditor(l: Line) {
    const entry = l.catalogItemId ? (catalog ?? []).find((c) => c.id === l.catalogItemId) : undefined;
    const swapped = l.ordered && l.name.trim() && l.name.trim().toLowerCase() !== l.ordered.testName.toLowerCase();
    return (
      <div className={`mt-2 grid gap-2 sm:grid-cols-[1fr_7rem] sm:items-start ${l.include ? '' : 'opacity-50'}`}>
        <div className="min-w-0">
          <SuggestInput
            value={l.name}
            onChange={(v) => {
              const hit = byName.get(v.trim().toLowerCase());
              update(l.key, hit ? { name: hit.name, catalogItemId: hit.id, price: hit.price } : { name: v, catalogItemId: null });
            }}
            suggestions={(catalog ?? []).map((c) => c.name)}
            showAllOnFocus
            placeholder={`Pick from the ${info.listTitle.toLowerCase()} or type`}
            className={inputClass}
            testId={`test-${l.key}`}
          />
          <div className="mt-1 flex flex-wrap gap-1.5">
            {swapped && <StatusPill tone="swap">In place of {l.ordered!.testName}</StatusPill>}
            {!l.catalogItemId && l.name.trim() && <StatusPill tone="warn">Not in the {info.listTitle.toLowerCase()}</StatusPill>}
            {entry && entry.price === 0 && <StatusPill tone="warn">No price set — enter the price</StatusPill>}
          </div>
        </div>
        <input
          type="number"
          min={0}
          step="0.01"
          value={Number.isNaN(l.price) ? '' : l.price}
          onChange={(e) => update(l.key, { price: Number(e.target.value) })}
          className={inputClass}
          aria-label="Price"
          data-testid={`test-price-${l.key}`}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-28 sm:px-6">
      <DeptPatientHeader dept={deptKey} patient={data.patient} />

      {receipt && <ReceiptCreated dept={deptKey} billId={receipt.id} total={receipt.total} count={receipt.items.length} onDone={() => setReceipt(null)} />}

      {!data.visits.length && <EmptyState>No {info.items} ordered for this patient. Add one below.</EmptyState>}

      {data.visits.map((v) => (
        <Card key={v.appointmentId} title={`Ordered · ${formatDate(v.date)}`} subtitle={[doctorName(v.doctorName), v.diagnosis].filter(Boolean).join(' · ')} className="mb-5">
          <ul className="divide-y divide-gray-100">
            {v.lines.map((o) => {
              const l = lineFor(o.orderId);
              return (
                <li key={o.orderId} className="py-3" data-testid="test-line">
                  <div className="flex flex-wrap items-start gap-3">
                    {o.status === 'PENDING' && l ? (
                      <input
                        type="checkbox"
                        checked={l.include}
                        onChange={(e) => update(l.key, { include: e.target.checked })}
                        className="mt-1 h-4 w-4 accent-teal"
                        aria-label={`Do ${o.testName}`}
                        data-testid={`do-${o.orderId}`}
                      />
                    ) : (
                      <span className="mt-1 h-4 w-4" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900">{o.testName}</p>
                      {o.notes && <p className="text-sm text-gray-500">{o.notes}</p>}
                    </div>
                    {o.status === 'DONE' && <StatusPill tone="done">Done{o.done[0] && o.done[0].testName !== o.testName ? ` as ${o.done[0].testName}` : ''}</StatusPill>}
                    {o.status === 'SKIPPED' && (
                      <span className="flex items-center gap-2">
                        <StatusPill tone="skipped">Not done here{o.skipReason ? ` — ${o.skipReason}` : ''}</StatusPill>
                        <button type="button" onClick={() => unskip.mutate(o.orderId)} className="text-xs text-teal hover:underline">
                          Undo
                        </button>
                      </span>
                    )}
                    {o.status === 'PENDING' && (
                      <button type="button" onClick={() => setSkipping(o)} className="text-xs text-gray-500 hover:text-red-600" data-testid={`skip-${o.orderId}`}>
                        Not doing here
                      </button>
                    )}
                  </div>
                  {o.status === 'PENDING' && l && <div className="pl-7">{renderEditor(l)}</div>}
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      <Card title={`Other ${info.items}`} subtitle="Anything the doctor didn't order" className="mb-5">
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
          onClick={() => setLines((ls) => [...ls, { key: `extra-${Date.now()}`, include: true, catalogItemId: null, name: '', price: 0 }])}
          className={`${btnSecondary} mt-3`}
          data-testid="add-test"
        >
          <Icon name="plus" className="h-4 w-4" /> Add {info.item}
        </button>
      </Card>

      {data.invoices.length > 0 && (
        <Card title="Results & reports" subtitle="Enter results when they're ready, and attach the report" className="mb-5">
          <div className="space-y-5">
            {data.invoices.map((inv) => (
              <ResultsBlock key={inv.id} dept={dept} invoice={inv} onSaved={refresh} />
            ))}
          </div>
        </Card>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-3 gap-y-2">
          <p className="mr-auto text-sm text-gray-600">
            {chosen.length} {chosen.length === 1 ? info.item : info.items} ·{' '}
            <span className="text-base font-semibold text-gray-900" data-testid="tests-total">
              {money(subtotal + tax)}
            </span>
            {tax > 0 && <span className="text-xs"> incl. {money(tax)} tax</span>}
          </p>
          {error && <p className="w-full text-sm text-red-600 sm:w-auto">{error}</p>}
          <button type="button" onClick={() => navigate(info.base)} className={`${btnSecondary} hidden sm:inline-flex`}>
            Next patient
          </button>
          <button
            type="button"
            onClick={() => markDone.mutate()}
            disabled={!chosen.length || chosen.some((l) => !l.name.trim() || l.price < 0) || markDone.isPending}
            className={btnPrimary}
            data-testid="mark-done"
          >
            {markDone.isPending ? 'Saving…' : 'Mark done & create receipt'}
          </button>
        </div>
      </div>

      {skipping && (
        <SkipDialog
          dept={deptKey}
          what={skipping.testName}
          busy={skip.isPending}
          onClose={() => setSkipping(null)}
          onConfirm={(reason) => skip.mutate({ id: skipping.orderId, reason })}
        />
      )}
    </div>
  );
}

function ResultsBlock({ dept, invoice, onSaved }: { dept: TestDept; invoice: LabInvoice; onSaved: () => void }) {
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(invoice.items.map((i) => [i.id, i.resultText ?? ''])));
  const [saved, setSaved] = useState(false);
  const dirty = invoice.items.some((i) => (draft[i.id] ?? '') !== (i.resultText ?? ''));
  const save = useMutation({
    mutationFn: () => Promise.all(invoice.items.filter((i) => (draft[i.id] ?? '') !== (i.resultText ?? '')).map((i) => saveTestResult(dept, i.id, draft[i.id] ?? ''))),
    onSuccess: () => {
      setSaved(true);
      onSaved();
    },
  });
  return (
    <div className="rounded-xl border border-gray-200 p-4" data-testid="results-block">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-gray-900">{new Date(invoice.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
        <span className="text-gray-500">· {money(invoice.total)}</span>
        <a href={`/receipts/${dept}/${invoice.id}`} target="_blank" rel="noreferrer" className="ml-auto text-teal hover:underline">
          Receipt
        </a>
      </div>
      <div className="space-y-3">
        {invoice.items.map((i) => (
          <label key={i.id} className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              {i.testName}
              {i.substitutedFor && <span className="font-normal text-gray-500"> (ordered: {i.substitutedFor})</span>}
            </span>
            <textarea
              rows={2}
              value={draft[i.id] ?? ''}
              onChange={(e) => {
                setSaved(false);
                setDraft((d) => ({ ...d, [i.id]: e.target.value }));
              }}
              placeholder="Result / findings"
              className={inputClass}
              data-testid={`result-${i.id}`}
            />
          </label>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button type="button" onClick={() => save.mutate()} disabled={!dirty || save.isPending} className={btnSecondary} data-testid="save-results">
          Save results
        </button>
        {saved && !dirty && <span className="text-sm text-teal">Saved</span>}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <AttachmentPanel category={dept === 'lab' ? 'LAB_REPORT' : 'RADIOLOGY_REPORT'} entityId={invoice.id} label="Report file" />
        {dept === 'radiology' && <AttachmentPanel category="RADIOLOGY_DICOM" entityId={invoice.id} label="DICOM image (optional)" />}
      </div>
    </div>
  );
}
