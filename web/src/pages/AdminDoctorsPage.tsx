import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listDoctors, getDoctorSchedule } from '../api/doctors';
import { createDoctor, updateDoctorSchedule } from '../api/admin';
import type { UpsertScheduleRequest } from '@opd/shared';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ScheduleEditor({ doctorId }: { doctorId: string }) {
  const queryClient = useQueryClient();
  const { data: schedule } = useQuery({
    queryKey: ['doctor-schedule', doctorId],
    queryFn: () => getDoctorSchedule(doctorId),
  });
  const [slots, setSlots] = useState<UpsertScheduleRequest[] | null>(null);

  const activeSlots = slots ?? schedule ?? [];

  const saveMutation = useMutation({
    mutationFn: (data: UpsertScheduleRequest[]) => updateDoctorSchedule(doctorId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['doctor-schedule', doctorId] }),
  });

  function toggleDay(dayOfWeek: number) {
    const exists = activeSlots.find((s) => s.dayOfWeek === dayOfWeek);
    if (exists) {
      setSlots(activeSlots.filter((s) => s.dayOfWeek !== dayOfWeek));
    } else {
      setSlots([...activeSlots, { dayOfWeek, startTime: '09:00', endTime: '13:00' }]);
    }
  }

  return (
    <div className="mt-3 rounded-md bg-gray-50 p-3">
      <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Weekly Availability</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {DAYS.map((label, dayOfWeek) => {
          const active = activeSlots.some((s) => s.dayOfWeek === dayOfWeek);
          return (
            <button
              key={dayOfWeek}
              onClick={() => toggleDay(dayOfWeek)}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                active ? 'border-teal bg-teal text-white' : 'border-gray-300 text-gray-600'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <button
        onClick={() => saveMutation.mutate(activeSlots)}
        disabled={saveMutation.isPending}
        className="rounded-md bg-teal px-3 py-1.5 text-xs text-white hover:bg-teal-mid disabled:opacity-60"
      >
        {saveMutation.isPending ? 'Saving…' : 'Save schedule'}
      </button>
    </div>
  );
}

export function AdminDoctorsPage() {
  const queryClient = useQueryClient();
  const { data: doctors } = useQuery({ queryKey: ['doctors'], queryFn: listDoctors });
  const [expanded, setExpanded] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    specialization: '',
    department: '',
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: createDoctor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
      setForm({ name: '', email: '', phone: '', password: '', specialization: '', department: '' });
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not create doctor'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    createMutation.mutate({ ...form, phone: form.phone || undefined });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-teal">Manage Doctors</h1>

      <form onSubmit={handleSubmit} className="mb-8 grid grid-cols-2 gap-3 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="col-span-2 font-semibold text-gray-700">Add Doctor</h2>
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
        <input
          placeholder="Specialization"
          required
          value={form.specialization}
          onChange={(e) => setForm((f) => ({ ...f, specialization: e.target.value }))}
          className="rounded-md border border-gray-300 px-3 py-2"
        />
        <input
          placeholder="Department"
          required
          value={form.department}
          onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
          className="rounded-md border border-gray-300 px-3 py-2"
        />
        {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="col-span-2 rounded-md bg-teal py-2 font-medium text-white hover:bg-teal-mid disabled:opacity-60"
        >
          {createMutation.isPending ? 'Adding…' : 'Add Doctor'}
        </button>
      </form>

      <h2 className="mb-3 font-semibold text-gray-700">All Doctors</h2>
      <div className="space-y-3">
        {doctors?.map((d) => (
          <div key={d.id} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{d.user.name}</p>
                <p className="text-sm text-gray-500">
                  {d.specialization} · {d.department}
                </p>
              </div>
              <button
                onClick={() => setExpanded(expanded === d.id ? null : d.id)}
                className="text-sm text-teal hover:underline"
              >
                {expanded === d.id ? 'Hide schedule' : 'Edit schedule'}
              </button>
            </div>
            {expanded === d.id && <ScheduleEditor doctorId={d.id} />}
          </div>
        ))}
      </div>
    </div>
  );
}
