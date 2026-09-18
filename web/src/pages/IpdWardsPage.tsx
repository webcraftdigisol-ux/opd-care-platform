import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bulkAddBeds, createWard, listWards, updateBed } from '../api/ipd';
import type { Bed } from '@opd/shared';

const STATUS_STYLES: Record<Bed['status'], string> = {
  VACANT: 'border-teal-mid bg-teal-light text-teal',
  OCCUPIED: 'border-gold-mid bg-gold-light text-gold',
  MAINTENANCE: 'border-gray-300 bg-gray-100 text-gray-500',
};

function BulkAddForm({ wardId }: { wardId: string }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ startNumber: '1', count: '10', prefix: '', dailyRate: '1000' });
  const [open, setOpen] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      bulkAddBeds(wardId, {
        startNumber: Number(form.startNumber),
        count: Number(form.count),
        prefix: form.prefix || undefined,
        dailyRate: Number(form.dailyRate),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ipd-wards'] });
      setOpen(false);
    },
  });

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-teal hover:underline">
        + Add beds
      </button>
    );
  }

  return (
    <div className="mt-2 grid grid-cols-2 gap-2 rounded-md bg-gray-50 p-3 sm:grid-cols-5">
      <input
        placeholder="Prefix (e.g. A-)"
        value={form.prefix}
        onChange={(e) => setForm((f) => ({ ...f, prefix: e.target.value }))}
        className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
      />
      <input
        type="number"
        placeholder="Start #"
        value={form.startNumber}
        onChange={(e) => setForm((f) => ({ ...f, startNumber: e.target.value }))}
        className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
      />
      <input
        type="number"
        placeholder="Count"
        value={form.count}
        onChange={(e) => setForm((f) => ({ ...f, count: e.target.value }))}
        className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
      />
      <input
        type="number"
        placeholder="Daily rate"
        value={form.dailyRate}
        onChange={(e) => setForm((f) => ({ ...f, dailyRate: e.target.value }))}
        className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
      />
      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="rounded-md bg-teal px-3 py-1.5 text-sm text-white hover:bg-teal-mid disabled:opacity-60"
      >
        {mutation.isPending ? 'Adding…' : 'Add'}
      </button>
    </div>
  );
}

export function IpdWardsPage() {
  const queryClient = useQueryClient();
  const { data: wards, isLoading } = useQuery({ queryKey: ['ipd-wards'], queryFn: listWards });
  const [newWardName, setNewWardName] = useState('');

  const createWardMutation = useMutation({
    mutationFn: () => createWard({ name: newWardName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ipd-wards'] });
      setNewWardName('');
    },
  });

  const bedStatusMutation = useMutation({
    mutationFn: ({ bedId, status }: { bedId: string; status: Bed['status'] }) => updateBed(bedId, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ipd-wards'] }),
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-teal">Wards & Beds</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createWardMutation.mutate();
        }}
        className="mb-8 flex gap-3 rounded-xl bg-white p-6 shadow-sm"
      >
        <input
          placeholder="New ward name (e.g. General Ward, ICU)"
          required
          value={newWardName}
          onChange={(e) => setNewWardName(e.target.value)}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2"
        />
        <button
          type="submit"
          disabled={createWardMutation.isPending}
          className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-mid disabled:opacity-60"
        >
          Add Ward
        </button>
      </form>

      {isLoading && <p className="text-gray-500">Loading…</p>}

      <div className="space-y-6">
        {wards?.map((ward) => (
          <div key={ward.id} className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-3 font-semibold text-gray-700">{ward.name}</h2>
            <div className="mb-3 flex flex-wrap gap-2">
              {ward.beds.map((bed) => (
                <button
                  key={bed.id}
                  onClick={() =>
                    bedStatusMutation.mutate({
                      bedId: bed.id,
                      status: bed.status === 'MAINTENANCE' ? 'VACANT' : 'MAINTENANCE',
                    })
                  }
                  disabled={bed.status === 'OCCUPIED'}
                  title={
                    bed.status === 'OCCUPIED'
                      ? 'Occupied'
                      : bed.status === 'MAINTENANCE'
                        ? 'Click to mark vacant'
                        : 'Click to mark under maintenance'
                  }
                  className={`rounded-md border px-3 py-2 text-xs font-medium ${STATUS_STYLES[bed.status]} ${
                    bed.status === 'OCCUPIED' ? 'cursor-default' : 'cursor-pointer'
                  }`}
                >
                  {bed.label}
                  <br />₹{bed.dailyRate}/day
                </button>
              ))}
              {ward.beds.length === 0 && <p className="text-sm text-gray-400">No beds yet.</p>}
            </div>
            <BulkAddForm wardId={ward.id} />
          </div>
        ))}
        {wards?.length === 0 && !isLoading && <p className="text-gray-500">No wards yet — add one above.</p>}
      </div>
    </div>
  );
}
