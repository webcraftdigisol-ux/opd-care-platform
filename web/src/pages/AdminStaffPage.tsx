import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createStaff, listStaff } from '../api/admin';
import type { Role } from '@opd/shared';

export function AdminStaffPage() {
  const queryClient = useQueryClient();
  const { data: staff } = useQuery({ queryKey: ['staff'], queryFn: listStaff });

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'PHARMACIST' as Extract<Role, 'PHARMACIST' | 'LAB_TECHNICIAN'>,
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createStaff,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      setForm({ name: '', email: '', phone: '', password: '', role: 'PHARMACIST' });
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not add staff member'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    createMutation.mutate({ ...form, phone: form.phone || undefined });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-teal">Pharmacy / Lab Staff</h1>

      <form onSubmit={handleSubmit} className="mb-8 grid grid-cols-2 gap-3 rounded-xl bg-white p-6 shadow-sm">
        <input
          placeholder="Full name"
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="rounded-md border border-gray-300 px-3 py-2"
        />
        <input
          placeholder="Email"
          type="email"
          required
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          className="rounded-md border border-gray-300 px-3 py-2"
        />
        <input
          placeholder="Phone"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          className="rounded-md border border-gray-300 px-3 py-2"
        />
        <input
          placeholder="Temporary password"
          type="password"
          required
          minLength={6}
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          className="rounded-md border border-gray-300 px-3 py-2"
        />
        <select
          value={form.role}
          onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as typeof form.role }))}
          className="col-span-2 rounded-md border border-gray-300 px-3 py-2"
        >
          <option value="PHARMACIST">Pharmacist</option>
          <option value="LAB_TECHNICIAN">Lab Technician</option>
        </select>
        {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="col-span-2 rounded-md bg-teal py-2 font-medium text-white hover:bg-teal-mid disabled:opacity-60"
        >
          {createMutation.isPending ? 'Adding…' : 'Add Staff Member'}
        </button>
      </form>

      <div className="space-y-2">
        {staff
          ?.filter((s) => s.role === 'PHARMACIST' || s.role === 'LAB_TECHNICIAN')
          .map((s) => (
            <div key={s.id} className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="font-medium">{s.name}</p>
              <p className="text-sm text-gray-500">
                {s.role === 'PHARMACIST' ? 'Pharmacist' : 'Lab Technician'} · {s.email}
              </p>
            </div>
          ))}
      </div>
    </div>
  );
}
