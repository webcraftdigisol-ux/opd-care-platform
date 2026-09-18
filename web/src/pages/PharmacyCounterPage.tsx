import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { searchPatients } from '../api/patients';
import { createPharmacySale, getPendingPharmacyLines } from '../api/pharmacy';
import { PaymentRecorder } from '../components/PaymentRecorder';
import type { PendingPharmacyLine, PharmacySale, PharmacySaleItemInput, PublicUser } from '@opd/shared';

interface LineState extends PharmacySaleItemInput {
  key: string;
  include: boolean;
}

function fromPending(line: PendingPharmacyLine): LineState {
  return {
    key: line.prescriptionId,
    prescriptionId: line.prescriptionId,
    itemId: line.matchedItem?.id,
    medicineName: line.medicine,
    quantity: line.suggestedQuantity,
    unitPrice: line.suggestedUnitPrice,
    include: !line.alreadyDispensed,
  };
}

export function PharmacyCounterPage() {
  const [search, setSearch] = useState('');
  const [patient, setPatient] = useState<PublicUser | null>(null);
  const [lines, setLines] = useState<LineState[]>([]);
  const [receipt, setReceipt] = useState<PharmacySale | null>(null);

  const { data: results } = useQuery({
    queryKey: ['patient-search', search],
    queryFn: () => searchPatients(search),
    enabled: search.length > 1,
  });

  const { data: pendingLines, isFetching } = useQuery({
    queryKey: ['pharmacy-pending', patient?.id],
    queryFn: () => getPendingPharmacyLines(patient!.id),
    enabled: !!patient,
  });

  useEffect(() => {
    if (pendingLines) setLines(pendingLines.map(fromPending));
  }, [pendingLines]);

  function selectPatient(p: PublicUser) {
    setPatient(p);
    setSearch('');
    setReceipt(null);
    setLines([]);
  }

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addFreeLine() {
    setLines((prev) => [
      ...prev,
      { key: `otc-${Date.now()}`, medicineName: '', quantity: 1, unitPrice: 0, include: true },
    ]);
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  const saleMutation = useMutation({
    mutationFn: () =>
      createPharmacySale({
        patientId: patient!.id,
        items: lines
          .filter((l) => l.include && l.medicineName.trim())
          .map(({ prescriptionId, itemId, medicineName, quantity, unitPrice }) => ({
            prescriptionId,
            itemId,
            medicineName,
            quantity,
            unitPrice,
          })),
      }),
    onSuccess: (sale) => {
      setReceipt(sale);
      setLines([]);
    },
  });

  const includedTotal = lines.filter((l) => l.include).reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-teal">Pharmacy Counter</h1>

      {!patient && (
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <label className="mb-1 block text-sm font-medium text-gray-700">Search patient by name or phone</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-teal focus:outline-none"
          />
          <div className="mt-3 space-y-2">
            {results?.map((p) => (
              <button
                key={p.id}
                onClick={() => selectPatient(p)}
                className="block w-full rounded-md border border-gray-200 p-3 text-left hover:border-teal hover:bg-teal-light"
              >
                <p className="font-medium">{p.name}</p>
                <p className="text-sm text-gray-500">{p.phone ?? p.email}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {patient && !receipt && (
        <div>
          <div className="mb-4 flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
            <div>
              <p className="font-medium">{patient.name}</p>
              <p className="text-sm text-gray-500">{patient.phone ?? patient.email}</p>
            </div>
            <button onClick={() => setPatient(null)} className="text-sm text-teal hover:underline">
              Change patient
            </button>
          </div>

          {isFetching && <p className="text-gray-500">Loading prescriptions…</p>}

          <div className="space-y-3">
            {lines.map((line) => (
              <div
                key={line.key}
                className={`rounded-lg border p-3 ${line.include ? 'border-teal-light bg-white' : 'border-gray-200 bg-gray-50 opacity-60'}`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={line.include}
                    onChange={(e) => updateLine(line.key, { include: e.target.checked })}
                    className="mt-2"
                  />
                  <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
                    <input
                      placeholder="Medicine"
                      value={line.medicineName}
                      onChange={(e) => updateLine(line.key, { medicineName: e.target.value })}
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm sm:col-span-2"
                    />
                    <input
                      type="number"
                      placeholder="Qty"
                      value={line.quantity}
                      onChange={(e) => updateLine(line.key, { quantity: Number(e.target.value) })}
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Unit price"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(line.key, { unitPrice: Number(e.target.value) })}
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <button onClick={() => removeLine(line.key)} className="text-red-400 hover:text-red-600">
                    ×
                  </button>
                </div>
                <p className="mt-1 ml-7 text-xs text-gray-400">
                  Line total: ₹{(line.quantity * line.unitPrice).toFixed(2)}
                  {!line.prescriptionId && ' (OTC / no catalog match)'}
                </p>
              </div>
            ))}
            {lines.length === 0 && !isFetching && (
              <p className="text-gray-500">No pending prescriptions for this patient.</p>
            )}
          </div>

          <button onClick={addFreeLine} className="mt-3 text-sm text-teal hover:underline">
            + Add item
          </button>

          <div className="mt-6 flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
            <p className="text-lg font-semibold">Total: ₹{includedTotal.toFixed(2)}</p>
            <button
              onClick={() => saleMutation.mutate()}
              disabled={saleMutation.isPending || includedTotal <= 0}
              className="rounded-md bg-teal px-4 py-2 font-medium text-white hover:bg-teal-mid disabled:opacity-60"
            >
              {saleMutation.isPending ? 'Confirming…' : 'Confirm & Print Receipt'}
            </button>
          </div>
        </div>
      )}

      {receipt && (
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-teal">Receipt</h2>
          <p className="text-sm text-gray-500">{new Date(receipt.createdAt).toLocaleString()}</p>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-1">Medicine</th>
                <th className="py-1">Qty</th>
                <th className="py-1">Unit</th>
                <th className="py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((item) => (
                <tr key={item.id} className="border-b border-gray-100">
                  <td className="py-1">{item.medicineName}</td>
                  <td className="py-1">{item.quantity}</td>
                  <td className="py-1">₹{item.unitPrice.toFixed(2)}</td>
                  <td className="py-1 text-right">₹{item.lineTotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 space-y-1 text-right text-sm">
            <p>Subtotal: ₹{receipt.subtotal.toFixed(2)}</p>
            <p>
              Tax ({receipt.taxPercent}%): ₹{receipt.taxAmount.toFixed(2)}
            </p>
            <p className="text-lg font-semibold">Total: ₹{receipt.total.toFixed(2)}</p>
          </div>
          <PaymentRecorder billType="PHARMACY" billId={receipt.id} />
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => window.print()}
              className="rounded-md border border-teal px-4 py-2 text-sm text-teal hover:bg-teal-light"
            >
              Print
            </button>
            <button
              onClick={() => setPatient(null)}
              className="rounded-md bg-teal px-4 py-2 text-sm text-white hover:bg-teal-mid"
            >
              Next patient
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
