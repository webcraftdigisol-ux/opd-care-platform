import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPharmacyItem, deletePharmacyItem, listPharmacyItems, updatePharmacyItem } from '../api/pharmacy';
import type { PharmacyItem, UpsertPharmacyItemRequest } from '@opd/shared';

type ItemFormState = {
  name: string;
  brand: string;
  unitsPerStrip: string;
  pricePerUnit: string;
  costPricePerUnit: string;
  stockUnits: string;
};

const EMPTY_FORM: ItemFormState = { name: '', brand: '', unitsPerStrip: '', pricePerUnit: '', costPricePerUnit: '', stockUnits: '' };

function toRequest(form: ItemFormState): UpsertPharmacyItemRequest {
  return {
    name: form.name,
    brand: form.brand || null,
    unitsPerStrip: form.unitsPerStrip ? Number(form.unitsPerStrip) : null,
    pricePerUnit: Number(form.pricePerUnit),
    costPricePerUnit: Number(form.costPricePerUnit),
    stockUnits: Number(form.stockUnits) || 0,
  };
}

function itemToForm(item: PharmacyItem): ItemFormState {
  return {
    name: item.name,
    brand: item.brand ?? '',
    unitsPerStrip: item.unitsPerStrip?.toString() ?? '',
    pricePerUnit: item.pricePerUnit.toString(),
    costPricePerUnit: item.costPricePerUnit.toString(),
    stockUnits: item.stockUnits.toString(),
  };
}

export function PharmacyInventoryPage() {
  const queryClient = useQueryClient();
  const { data: items } = useQuery({ queryKey: ['pharmacy-items'], queryFn: listPharmacyItems });

  const [form, setForm] = useState<ItemFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ItemFormState>(EMPTY_FORM);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createPharmacyItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy-items'] });
      setForm(EMPTY_FORM);
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not add item'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<UpsertPharmacyItemRequest> }) => updatePharmacyItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy-items'] });
      setEditingId(null);
    },
    onError: (err: any) => setEditError(err.response?.data?.message ?? 'Could not save changes'),
  });

  const deleteMutation = useMutation({
    mutationFn: deletePharmacyItem,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pharmacy-items'] }),
    onError: (err: any) => setDeleteError(err.response?.data?.message ?? 'Could not delete item'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    createMutation.mutate(toRequest(form));
  }

  function startEdit(item: PharmacyItem) {
    setEditingId(item.id);
    setEditForm(itemToForm(item));
    setEditError(null);
  }

  function saveEdit() {
    if (!editingId) return;
    setEditError(null);
    updateMutation.mutate({ id: editingId, data: toRequest(editForm) });
  }

  function handleDelete(item: PharmacyItem) {
    setDeleteError(null);
    if (!window.confirm(`Delete "${item.name}" from the medicine catalog?`)) return;
    deleteMutation.mutate(item.id);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-teal">Medicine Catalog</h1>

      <form onSubmit={handleSubmit} className="mb-8 grid grid-cols-2 gap-3 rounded-xl bg-white p-6 shadow-sm sm:grid-cols-6">
        <input
          placeholder="Medicine name"
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="col-span-2 rounded-md border border-gray-300 px-3 py-2 sm:col-span-1"
        />
        <input
          placeholder="Brand (optional)"
          value={form.brand}
          onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
          className="rounded-md border border-gray-300 px-3 py-2"
        />
        <input
          placeholder="Units/strip (blank if sold per unit)"
          value={form.unitsPerStrip}
          onChange={(e) => setForm((f) => ({ ...f, unitsPerStrip: e.target.value }))}
          className="rounded-md border border-gray-300 px-3 py-2"
        />
        <input
          placeholder="Price / unit"
          type="number"
          step="0.01"
          required
          value={form.pricePerUnit}
          onChange={(e) => setForm((f) => ({ ...f, pricePerUnit: e.target.value }))}
          className="rounded-md border border-gray-300 px-3 py-2"
        />
        <input
          placeholder="Cost / unit"
          type="number"
          step="0.01"
          required
          value={form.costPricePerUnit}
          onChange={(e) => setForm((f) => ({ ...f, costPricePerUnit: e.target.value }))}
          className="rounded-md border border-gray-300 px-3 py-2"
        />
        <input
          placeholder="Stock (units)"
          type="number"
          value={form.stockUnits}
          onChange={(e) => setForm((f) => ({ ...f, stockUnits: e.target.value }))}
          className="rounded-md border border-gray-300 px-3 py-2"
        />
        {error && <p className="col-span-full text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="col-span-full rounded-md bg-teal py-2 font-medium text-white hover:bg-teal-mid disabled:opacity-60 sm:col-span-1"
        >
          Add
        </button>
      </form>

      {deleteError && <p className="mb-4 text-sm text-red-600">{deleteError}</p>}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-teal-light text-teal">
            <tr>
              <th className="px-4 py-2">Medicine</th>
              <th className="px-4 py-2">Brand</th>
              <th className="px-4 py-2">Packaging</th>
              <th className="px-4 py-2">Price/unit</th>
              <th className="px-4 py-2">Cost/unit</th>
              <th className="px-4 py-2">Stock</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items?.map((item) =>
              editingId === item.id ? (
                <tr key={item.id} className="border-t border-gray-100 bg-teal-light/30" data-testid="pharmacy-item-editing-row">
                  <td className="px-4 py-2">
                    <input
                      value={editForm.name}
                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full rounded-md border border-gray-300 px-2 py-1"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      value={editForm.brand}
                      onChange={(e) => setEditForm((f) => ({ ...f, brand: e.target.value }))}
                      className="w-full rounded-md border border-gray-300 px-2 py-1"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      placeholder="Units/strip"
                      value={editForm.unitsPerStrip}
                      onChange={(e) => setEditForm((f) => ({ ...f, unitsPerStrip: e.target.value }))}
                      className="w-full rounded-md border border-gray-300 px-2 py-1"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.pricePerUnit}
                      onChange={(e) => setEditForm((f) => ({ ...f, pricePerUnit: e.target.value }))}
                      className="w-24 rounded-md border border-gray-300 px-2 py-1"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.costPricePerUnit}
                      onChange={(e) => setEditForm((f) => ({ ...f, costPricePerUnit: e.target.value }))}
                      className="w-24 rounded-md border border-gray-300 px-2 py-1"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      value={editForm.stockUnits}
                      onChange={(e) => setEditForm((f) => ({ ...f, stockUnits: e.target.value }))}
                      className="w-20 rounded-md border border-gray-300 px-2 py-1"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex flex-col gap-1">
                      <div className="flex gap-2">
                        <button
                          onClick={saveEdit}
                          disabled={updateMutation.isPending}
                          className="text-teal hover:underline disabled:opacity-60"
                        >
                          Save
                        </button>
                        <button onClick={() => setEditingId(null)} className="text-gray-400 hover:underline">
                          Cancel
                        </button>
                      </div>
                      {editError && <p className="text-xs text-red-600">{editError}</p>}
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={item.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium">{item.name}</td>
                  <td className="px-4 py-2 text-gray-500">{item.brand || '—'}</td>
                  <td className="px-4 py-2 text-gray-500">
                    {item.unitsPerStrip ? `Strip of ${item.unitsPerStrip}` : 'Per unit'}
                  </td>
                  <td className="px-4 py-2">₹{item.pricePerUnit.toFixed(2)}</td>
                  <td className="px-4 py-2 text-gray-500">₹{item.costPricePerUnit.toFixed(2)}</td>
                  <td className="px-4 py-2">{item.stockUnits}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-3">
                      <button onClick={() => startEdit(item)} className="text-teal hover:underline">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(item)} className="text-red-500 hover:underline">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
