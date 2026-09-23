import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createRadiologyCatalogEntry, deleteRadiologyCatalogEntry, listRadiologyCatalog, updateRadiologyCatalogEntry } from '../api/radiology';
import type { RadiologyTestCatalogEntry } from '@opd/shared';

export function RadiologyCatalogPage() {
  const queryClient = useQueryClient();
  const { data: catalog } = useQuery({ queryKey: ['radiology-catalog'], queryFn: listRadiologyCatalog });

  const [form, setForm] = useState({ name: '', price: '' });
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', price: '' });
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createRadiologyCatalogEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['radiology-catalog'] });
      setForm({ name: '', price: '' });
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not add test'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name, price }: { id: string; name: string; price: number }) =>
      updateRadiologyCatalogEntry(id, { name, price }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['radiology-catalog'] });
      setEditingId(null);
    },
    onError: (err: any) => setEditError(err.response?.data?.message ?? 'Could not save changes'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRadiologyCatalogEntry,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['radiology-catalog'] }),
    onError: (err: any) => setDeleteError(err.response?.data?.message ?? 'Could not delete test'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    createMutation.mutate({ name: form.name, price: Number(form.price) });
  }

  function startEdit(entry: RadiologyTestCatalogEntry) {
    setEditingId(entry.id);
    setEditForm({ name: entry.name, price: entry.price.toString() });
    setEditError(null);
  }

  function saveEdit() {
    if (!editingId) return;
    setEditError(null);
    updateMutation.mutate({ id: editingId, name: editForm.name, price: Number(editForm.price) });
  }

  function handleDelete(entry: RadiologyTestCatalogEntry) {
    setDeleteError(null);
    if (!window.confirm(`Delete "${entry.name}" from the radiology test catalog?`)) return;
    deleteMutation.mutate(entry.id);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-teal">Radiology Test Catalog</h1>

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
      {deleteError && <p className="mb-4 text-sm text-red-600">{deleteError}</p>}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-teal-light text-teal">
            <tr>
              <th className="px-4 py-2">Test</th>
              <th className="px-4 py-2">Price</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {catalog?.map((entry) =>
              editingId === entry.id ? (
                <tr key={entry.id} className="border-t border-gray-100 bg-teal-light/30" data-testid="radiology-catalog-editing-row">
                  <td className="px-4 py-2">
                    <input
                      value={editForm.name}
                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full rounded-md border border-gray-300 px-2 py-1"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.price}
                      onChange={(e) => setEditForm((f) => ({ ...f, price: e.target.value }))}
                      className="w-24 rounded-md border border-gray-300 px-2 py-1"
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
                <tr key={entry.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium">{entry.name}</td>
                  <td className="px-4 py-2">₹{entry.price.toFixed(2)}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-3">
                      <button onClick={() => startEdit(entry)} className="text-teal hover:underline">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(entry)} className="text-red-500 hover:underline">
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
