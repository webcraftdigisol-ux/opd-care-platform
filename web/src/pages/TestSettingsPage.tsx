import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addStarterTests,
  createTestCatalogEntry,
  deleteTestCatalogEntry,
  listTestCatalog,
  updateTestCatalogEntry,
  type TestDept,
} from '../api/departments';
import { Card, btnPrimary, btnSecondary, inputClass } from '../components/ui';
import { DeptTabs } from '../components/DeptTabs';
import { Icon } from '../components/Icon';
import { DEPTS, money } from '../utils/departments';

const PAGE = 50;

// The lab's or radiology's settings: the tests it offers and their prices.
// Doctors order from this list; the standard list loads in one click,
// unpriced.
export function TestSettingsPage({ dept }: { dept: TestDept }) {
  const info = DEPTS[dept === 'lab' ? 'LAB' : 'RADIOLOGY'];
  const queryClient = useQueryClient();
  const key = ['test-catalog', dept];
  const { data: tests, isLoading } = useQuery({ queryKey: key, queryFn: () => listTestCatalog(dept) });
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: '', price: '', cost: '' });
  const [filter, setFilter] = useState('');
  const [unpricedOnly, setUnpricedOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ['catalog-suggestions'] });
  };
  const fail = (err: any, fallback: string) => setMessage({ ok: false, text: err.response?.data?.message ?? fallback });

  const create = useMutation({
    mutationFn: () => createTestCatalogEntry(dept, { name: name.trim(), price: Number(price) || 0, cost: Number(cost) || 0 }),
    onSuccess: (t) => {
      setName('');
      setPrice('');
      setCost('');
      setMessage({ ok: true, text: `Added ${t.name}.` });
      refresh();
    },
    onError: (err) => fail(err, 'Could not add'),
  });
  const save = useMutation({
    mutationFn: () => updateTestCatalogEntry(dept, editing!, { name: edit.name.trim(), price: Number(edit.price) || 0, cost: Number(edit.cost) || 0 }),
    onSuccess: () => {
      setEditing(null);
      setMessage(null);
      refresh();
    },
    onError: (err) => fail(err, 'Could not save'),
  });
  const remove = useMutation({ mutationFn: (id: string) => deleteTestCatalogEntry(dept, id), onSuccess: refresh, onError: (err) => fail(err, 'Could not remove') });
  const starter = useMutation({
    mutationFn: () => addStarterTests(dept),
    onSuccess: ({ added }) => {
      setMessage({ ok: true, text: added ? `Added ${added} ${info.items}. Set their prices below.` : 'The standard list is already loaded.' });
      refresh();
    },
    onError: (err) => fail(err, 'Could not load the list'),
  });

  const unpriced = tests?.filter((t) => t.price === 0).length ?? 0;
  const q = filter.trim().toLowerCase();
  const matching = (tests ?? []).filter((t) => (!unpricedOnly || t.price === 0) && t.name.toLowerCase().includes(q));
  const shown = matching.slice(0, limit);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <DeptTabs
        dept={info.dept}
        actions={
          <button type="button" onClick={() => starter.mutate()} disabled={starter.isPending} className={btnSecondary} data-testid="load-standard">
            {starter.isPending ? 'Loading…' : 'Load standard list'}
          </button>
        }
      />
      <p className="-mt-3 mb-4 text-sm text-gray-500">
        The {info.items} {info.label.toLowerCase()} offers, with price and cost — doctors order from this list.
      </p>

      <Card className="mb-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <label className="min-w-[14rem] flex-1 text-sm">
            <span className="mb-1 block font-medium text-gray-700">Name</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder={dept === 'lab' ? 'e.g. HbA1c' : 'e.g. X-Ray Knee AP/Lateral'} className={inputClass} data-testid="test-name" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">Price (₹)</span>
            <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={`${inputClass} !w-32`} data-testid="test-price" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-gray-700">Cost (₹)</span>
            <input type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} className={`${inputClass} !w-32`} data-testid="test-cost" />
          </label>
          <button type="submit" disabled={create.isPending} className={btnPrimary} data-testid="add-test-entry">
            <Icon name="plus" className="h-4 w-4" /> Add
          </button>
        </form>
      </Card>

      {message && <p className={`mb-4 rounded-lg p-3 text-sm ${message.ok ? 'bg-teal-light text-teal' : 'bg-red-50 text-red-700'}`}>{message.text}</p>}

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Filter"
            className={`${inputClass} !w-72 max-w-full`}
            data-testid="test-filter"
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={unpricedOnly} onChange={(e) => setUnpricedOnly(e.target.checked)} className="accent-teal" />
            Only without a price ({unpriced})
          </label>
          <span className="ml-auto text-sm text-gray-500">
            {tests?.length ?? 0} {info.items}
          </span>
        </div>
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : !tests?.length ? (
          <p className="rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-600">
            The list is empty. Load the standard list, or add your own above.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {shown.map((t) =>
              editing === t.id ? (
                <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
                  <input value={edit.name} onChange={(e) => setEdit((x) => ({ ...x, name: e.target.value }))} className={`${inputClass} min-w-[12rem] flex-1`} aria-label="Name" />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={edit.price}
                    onChange={(e) => setEdit((x) => ({ ...x, price: e.target.value }))}
                    className={`${inputClass} !w-28`}
                    aria-label="Price"
                    data-testid="edit-price"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={edit.cost}
                    onChange={(e) => setEdit((x) => ({ ...x, cost: e.target.value }))}
                    placeholder="Cost"
                    className={`${inputClass} !w-28`}
                    aria-label="Cost"
                    data-testid="edit-cost"
                  />
                  <button type="button" onClick={() => save.mutate()} disabled={save.isPending || !edit.name.trim()} className="font-medium text-teal hover:underline" data-testid="save-edit">
                    Save
                  </button>
                  <button type="button" onClick={() => setEditing(null)} className="text-gray-500 hover:underline">
                    Cancel
                  </button>
                </li>
              ) : (
                <li key={t.id} className="flex items-center gap-3 py-2 text-sm" data-testid="test-row">
                  <span className="min-w-0 flex-1 font-medium text-gray-900">{t.name}</span>
                  <span className="w-24 text-right text-xs text-gray-500">{t.cost ? `cost ${money(t.cost)}` : ''}</span>
                  <span className="w-24 text-right">{t.price ? money(t.price) : <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">Not set</span>}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(t.id);
                      setEdit({ name: t.name, price: t.price ? String(t.price) : '', cost: t.cost ? String(t.cost) : '' });
                    }}
                    className="text-teal hover:underline"
                    aria-label={`Edit ${t.name}`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => window.confirm(`Remove ${t.name} from the list?`) && remove.mutate(t.id)}
                    className="text-red-600 hover:underline"
                    aria-label={`Remove ${t.name}`}
                  >
                    Remove
                  </button>
                </li>
              ),
            )}
          </ul>
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
