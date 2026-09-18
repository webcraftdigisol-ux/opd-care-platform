import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createLabCatalogEntry, listLabCatalog } from '../api/lab';

export function LabCatalogPage() {
  const queryClient = useQueryClient();
  const { data: catalog } = useQuery({ queryKey: ['lab-catalog'], queryFn: listLabCatalog });

  const [form, setForm] = useState({ name: '', price: '' });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createLabCatalogEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-catalog'] });
      setForm({ name: '', price: '' });
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not add test'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    createMutation.mutate({ name: form.name, price: Number(form.price) });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-teal">Lab Test Catalog</h1>

      <form onSubmit={handleSubmit} className="mb-8 flex gap-3 rounded-xl bg-white p-6 shadow-sm">
        <input
          placeholder="Test name"
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2"
        />
        <input
          placeholder="Price"
          type="number"
          step="0.01"
          required
          value={form.price}
          onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
          className="w-32 rounded-md border border-gray-300 px-3 py-2"
        />
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded-md bg-teal px-4 py-2 font-medium text-white hover:bg-teal-mid disabled:opacity-60"
        >
          Add
        </button>
      </form>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-teal-light text-teal">
            <tr>
              <th className="px-4 py-2">Test</th>
              <th className="px-4 py-2">Price</th>
            </tr>
          </thead>
          <tbody>
            {catalog?.map((entry) => (
              <tr key={entry.id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium">{entry.name}</td>
                <td className="px-4 py-2">₹{entry.price.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
