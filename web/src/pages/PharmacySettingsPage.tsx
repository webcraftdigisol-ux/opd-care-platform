import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PharmacyItem, UpsertPharmacyItemRequest } from '@opd/shared';
import { createPharmacyItem, deletePharmacyItem, listPharmacyItems, updatePharmacyItem } from '../api/pharmacy';
import { addStarterMedicines } from '../api/departments';
import { Card, Field, btnPrimary, btnSecondary, inputClass } from '../components/ui';
import { DeptTabs } from '../components/DeptTabs';
import { Icon } from '../components/Icon';
import { money } from '../utils/departments';

const PAGE = 50;

type Form = { name: string; strength: string; brand: string; unitsPerStrip: string; cost: string; mrp: string; stock: string };
const EMPTY: Form = { name: '', strength: '', brand: '', unitsPerStrip: '', cost: '', mrp: '', stock: '' };

const toForm = (i: PharmacyItem): Form => ({
  name: i.name,
  strength: i.strength ?? '',
  brand: i.brand ?? '',
  unitsPerStrip: i.unitsPerStrip?.toString() ?? '',
  cost: i.costPricePerUnit ? String(i.costPricePerUnit) : '',
  mrp: i.pricePerUnit ? String(i.pricePerUnit) : '',
  stock: i.stockUnits ? String(i.stockUnits) : '',
});

const toRequest = (f: Form): UpsertPharmacyItemRequest => ({
  name: f.name.trim(),
  strength: f.strength.trim() || null,
  brand: f.brand.trim() || null,
  unitsPerStrip: f.unitsPerStrip ? Number(f.unitsPerStrip) : null,
  costPricePerUnit: Number(f.cost) || 0,
  pricePerUnit: Number(f.mrp) || 0,
  stockUnits: Number(f.stock) || 0,
});

// The pharmacy's settings: its medicine list -- generic name, strength,
// brand, cost and MRP. Doctors prescribe from it, the counter dispenses
// and substitutes from it. The standard list loads in one click, unpriced.
export function PharmacySettingsPage() {
  const queryClient = useQueryClient();
  const { data: items, isLoading } = useQuery({ queryKey: ['pharmacy-items'], queryFn: listPharmacyItems });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState<Form>(EMPTY);
  const [filter, setFilter] = useState('');
  const [unpricedOnly, setUnpricedOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['pharmacy-items'] });
    queryClient.invalidateQueries({ queryKey: ['catalog-suggestions'] });
  };
  const fail = (err: any, fallback: string) => setMessage({ ok: false, text: err.response?.data?.message ?? fallback });

  const create = useMutation({
    mutationFn: () => createPharmacyItem(toRequest(form)),
    onSuccess: (i) => {
      setForm(EMPTY);
      setMessage({ ok: true, text: `Added ${i.brand ?? i.name}.` });
      refresh();
    },
    onError: (err) => fail(err, 'Could not add'),
  });
  const save = useMutation({
    mutationFn: () => updatePharmacyItem(editing!, toRequest(edit)),
    onSuccess: () => {
      setEditing(null);
      setMessage(null);
      refresh();
    },
    onError: (err) => fail(err, 'Could not save'),
  });
  const remove = useMutation({ mutationFn: deletePharmacyItem, onSuccess: refresh, onError: (err) => fail(err, 'Could not remove') });
  const starter = useMutation({
    mutationFn: addStarterMedicines,
    onSuccess: ({ added }) => {
      setMessage({ ok: true, text: added ? `Added ${added} medicines. Fill in cost and MRP as you stock them.` : 'The standard list is already loaded.' });
      refresh();
    },
    onError: (err) => fail(err, 'Could not load the list'),
  });

  const unpriced = items?.filter((i) => i.pricePerUnit === 0).length ?? 0;
  const q = filter.trim().toLowerCase();
  // Names or brands that start with the filter come first ("paracetamol"
  // lists plain Paracetamol before the combinations containing it).
  const starts = (i: PharmacyItem) => (i.name.toLowerCase().startsWith(q) || (i.brand ?? '').toLowerCase().startsWith(q) ? 0 : 1);
  const matching = (items ?? [])
    .filter((i) => (!unpricedOnly || i.pricePerUnit === 0) && `${i.name} ${i.strength ?? ''} ${i.brand ?? ''}`.toLowerCase().includes(q))
    .sort((a, b) => (q ? starts(a) - starts(b) : 0));
  const shown = matching.slice(0, limit);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setE = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setEdit((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <DeptTabs
        dept="PHARMACY"
        actions={
          <>
            <button type="button" onClick={() => starter.mutate()} disabled={starter.isPending} className={btnSecondary} data-testid="load-standard">
              {starter.isPending ? 'Loading…' : 'Load standard list'}
            </button>
            <button type="button" onClick={() => setAdding((a) => !a)} className={adding ? btnSecondary : btnPrimary} data-testid="toggle-add">
              {adding ? 'Close' : <><Icon name="plus" className="h-4 w-4" /> Add medicine</>}
            </button>
          </>
        }
      />
      <p className="-mt-3 mb-4 text-sm text-gray-500">
        What the pharmacy stocks — doctors prescribe from this list, and brands of the same composition can be swapped at the counter.
      </p>

      {adding && (
        <Card title="New medicine" className="mb-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
            className="grid gap-3 sm:grid-cols-4"
          >
            <Field label="Generic name (composition)" required className="sm:col-span-2">
              <input required value={form.name} onChange={set('name')} placeholder="e.g. Paracetamol" className={inputClass} data-testid="med-name" />
            </Field>
            <Field label="Strength / power">
              <input value={form.strength} onChange={set('strength')} placeholder="e.g. 650 mg" className={inputClass} data-testid="med-strength" />
            </Field>
            <Field label="Brand">
              <input value={form.brand} onChange={set('brand')} placeholder="e.g. Dolo 650" className={inputClass} data-testid="med-brand" />
            </Field>
            <Field label="Cost / unit (₹)">
              <input type="number" min={0} step="0.01" value={form.cost} onChange={set('cost')} className={inputClass} data-testid="med-cost" />
            </Field>
            <Field label="MRP / unit (₹)">
              <input type="number" min={0} step="0.01" value={form.mrp} onChange={set('mrp')} className={inputClass} data-testid="med-mrp" />
            </Field>
            <Field label="Units per strip" hint="Blank if sold per unit">
              <input type="number" min={1} value={form.unitsPerStrip} onChange={set('unitsPerStrip')} className={inputClass} />
            </Field>
            <Field label="Stock (units)" hint="Optional">
              <input type="number" min={0} value={form.stock} onChange={set('stock')} className={inputClass} />
            </Field>
            <div className="sm:col-span-4">
              <button type="submit" disabled={create.isPending} className={btnPrimary} data-testid="save-medicine">
                Add to list
              </button>
            </div>
          </form>
        </Card>
      )}

      {message && <p className={`mb-4 rounded-lg p-3 text-sm ${message.ok ? 'bg-teal-light text-teal' : 'bg-red-50 text-red-700'}`}>{message.text}</p>}

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Filter by generic name, strength or brand"
            className={`${inputClass} !w-80 max-w-full`}
            data-testid="med-filter"
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={unpricedOnly} onChange={(e) => setUnpricedOnly(e.target.checked)} className="accent-teal" />
            Only without MRP ({unpriced})
          </label>
          <span className="ml-auto text-sm text-gray-500">{items?.length ?? 0} medicines</span>
        </div>

        {isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : !items?.length ? (
          <div className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-600">
            <p>The medicine list is empty.</p>
            <p className="mt-1">Load the standard list of common medicines and brands, or add your own.</p>
          </div>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-2">Generic · strength</th>
                  <th className="px-3 py-2">Brand</th>
                  <th className="px-3 py-2">Pack</th>
                  <th className="px-3 py-2 text-right">Cost / unit</th>
                  <th className="px-3 py-2 text-right">MRP / unit</th>
                  <th className="px-3 py-2 text-right">Stock</th>
                  <th className="px-5 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shown.map((i) =>
                  editing === i.id ? (
                    <tr key={i.id} className="bg-teal-light/30 align-top" data-testid="med-row-editing">
                      <td className="px-5 py-2">
                        <input value={edit.name} onChange={setE('name')} className={`${inputClass} mb-1`} aria-label="Generic name" />
                        <input value={edit.strength} onChange={setE('strength')} placeholder="Strength" className={inputClass} aria-label="Strength" />
                      </td>
                      <td className="px-3 py-2">
                        <input value={edit.brand} onChange={setE('brand')} className={inputClass} aria-label="Brand" data-testid="edit-brand" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min={1} value={edit.unitsPerStrip} onChange={setE('unitsPerStrip')} placeholder="Units" className={`${inputClass} !w-20`} aria-label="Units per strip" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min={0} step="0.01" value={edit.cost} onChange={setE('cost')} className={`${inputClass} !w-24`} aria-label="Cost per unit" data-testid="edit-cost" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min={0} step="0.01" value={edit.mrp} onChange={setE('mrp')} className={`${inputClass} !w-24`} aria-label="MRP per unit" data-testid="edit-mrp" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min={0} value={edit.stock} onChange={setE('stock')} className={`${inputClass} !w-20`} aria-label="Stock" />
                      </td>
                      <td className="whitespace-nowrap px-5 py-2">
                        <button type="button" onClick={() => save.mutate()} disabled={save.isPending || !edit.name.trim()} className="font-medium text-teal hover:underline" data-testid="save-edit">
                          Save
                        </button>
                        <button type="button" onClick={() => setEditing(null)} className="ml-3 text-gray-500 hover:underline">
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={i.id} data-testid="med-row">
                      <td className="px-5 py-2">
                        <span className="font-medium text-gray-900">{i.name}</span>
                        {i.strength && <span className="text-gray-500"> {i.strength}</span>}
                      </td>
                      <td className="px-3 py-2">{i.brand ?? <span className="text-gray-400">—</span>}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-500">{i.unitsPerStrip ? `Strip of ${i.unitsPerStrip}` : 'Per unit'}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{i.costPricePerUnit ? money(i.costPricePerUnit) : '—'}</td>
                      <td className="px-3 py-2 text-right">
                        {i.pricePerUnit ? money(i.pricePerUnit) : <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">Not set</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">{i.stockUnits || '—'}</td>
                      <td className="whitespace-nowrap px-5 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(i.id);
                            setEdit(toForm(i));
                          }}
                          className="text-teal hover:underline"
                          aria-label={`Edit ${i.brand ?? i.name}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => window.confirm(`Remove ${i.brand ?? i.name} from the medicine list?`) && remove.mutate(i.id)}
                          className="ml-3 text-red-600 hover:underline"
                          aria-label={`Remove ${i.brand ?? i.name}`}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
            {!matching.length && <p className="px-5 py-6 text-center text-sm text-gray-500">No medicines match.</p>}
          </div>
        )}
        {matching.length > limit && (
          <button type="button" onClick={() => setLimit((l) => l + PAGE)} className={`${btnSecondary} mt-4`}>
            Show more ({matching.length - limit} more)
          </button>
        )}
      </Card>
    </div>
  );
}
