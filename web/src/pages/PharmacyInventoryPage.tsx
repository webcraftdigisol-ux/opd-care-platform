import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPharmacyItem, listPharmacyItems, updatePharmacyItem } from '../api/pharmacy';

export function PharmacyInventoryPage() {
  const queryClient = useQueryClient();
  const { data: items } = useQuery({ queryKey: ['pharmacy-items'], queryFn: listPharmacyItems });

  const [form, setForm] = useState({
    name: '',
    unitsPerStrip: '',
    pricePerUnit: '',
    costPricePerUnit: '',
    stockUnits: '',
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createPharmacyItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy-items'] });
      setForm({ name: '', unitsPerStrip: '', pricePerUnit: '', costPricePerUnit: '', stockUnits: '' });
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not add item'),
  });

  const restockMutation = useMutation({
    mutationFn: ({ id, stockUnits }: { id: string; stockUnits: number }) =>
      updatePharmacyItem(id, { stockUnits }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pharmacy-items'] }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    createMutation.mutate({
      name: form.name,
      unitsPerStrip: form.unitsPerStrip ? Number(form.unitsPerStrip) : null,
      pricePerUnit: Number(form.pricePerUnit),
      costPricePerUnit: Number(form.costPricePerUnit),
      stockUnits: Number(form.stockUnits) || 0,
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-teal">Pharmacy Inventory</h1>

      <form onSubmit={handleSubmit} className="mb-8 grid grid-cols-2 gap-3 rounded-xl bg-white p-6 shadow-sm sm:grid-cols-5">
        <input
          placeholder="Medicine name"
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="col-span-2 rounded-md border border-gray-300 px-3 py-2 sm:col-span-1"
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

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-teal-light text-teal">
            <tr>
              <th className="px-4 py-2">Medicine</th>
              <th className="px-4 py-2">Packaging</th>
              <th className="px-4 py-2">Price/unit</th>
              <th className="px-4 py-2">Stock</th>
              <th className="px-4 py-2">Restock</th>
            </tr>
          </thead>
          <tbody>
            {items?.map((item) => (
              <tr key={item.id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium">{item.name}</td>
                <td className="px-4 py-2 text-gray-500">
                  {item.unitsPerStrip ? `Strip of ${item.unitsPerStrip}` : 'Per unit'}
                </td>
                <td className="px-4 py-2">₹{item.pricePerUnit.toFixed(2)}</td>
                <td className="px-4 py-2">{item.stockUnits}</td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => {
                      const addQty = Number(window.prompt('Add how many units to stock?', '0'));
                      if (addQty > 0) {
                        restockMutation.mutate({ id: item.id, stockUnits: item.stockUnits + addQty });
                      }
                    }}
                    className="text-teal hover:underline"
                  >
                    + Add stock
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
