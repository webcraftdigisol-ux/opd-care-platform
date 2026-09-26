import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listDoctors, getDoctorSchedule } from '../api/doctors';
import { createDoctor, updateDoctor, updateDoctorSchedule } from '../api/admin';
import type { UpsertScheduleRequest } from '@opd/shared';

function FeeEditor({ doctorId, currentFee }: { doctorId: string; currentFee: number }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [fee, setFee] = useState(String(currentFee));

  const saveMutation = useMutation({
    mutationFn: () => updateDoctor(doctorId, { consultationFee: Number(fee) || 0 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
      setEditing(false);
    },
  });

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="text-sm text-teal hover:underline">
        Fee: ₹{currentFee.toFixed(2)}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        step="0.01"
        value={fee}
        onChange={(e) => setFee(e.target.value)}
        className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
      />
      <button
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        className="rounded-md bg-teal px-2 py-1 text-xs text-white disabled:opacity-60"
      >
        Save
      </button>
    </div>
  );
}

// Printed under the doctor's name on visit summaries.
function CredentialsEditor({ doctorId, qualification, registrationNumber }: { doctorId: string; qualification: string | null; registrationNumber: string | null }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState(qualification ?? '');
  const [reg, setReg] = useState(registrationNumber ?? '');
  const save = useMutation({
    mutationFn: () => updateDoctor(doctorId, { qualification: q, registrationNumber: reg }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
      setEditing(false);
    },
  });
  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="text-left text-sm text-gray-500 hover:text-teal">
        {qualification || registrationNumber
          ? [qualification, registrationNumber && `Reg. No. ${registrationNumber}`].filter(Boolean).join(' · ')
          : '+ Add qualification & registration no.'}
      </button>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input placeholder="Qualification, e.g. MBBS, MD" value={q} onChange={(e) => setQ(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1 text-sm" />
      <input placeholder="Registration no." value={reg} onChange={(e) => setReg(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1 text-sm" />
      <button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-md bg-teal px-2 py-1 text-xs text-white disabled:opacity-60">
        Save
      </button>
      <button onClick={() => setEditing(false)} className="text-xs text-gray-500">
        Cancel
      </button>
    </div>
  );
}

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
    consultationFee: '',
    qualification: '',
    registrationNumber: '',
  });
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => createDoctor({ ...form, phone: form.phone || undefined, consultationFee: Number(form.consultationFee) || 0 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
      setForm({ name: '', email: '', phone: '', password: '', specialization: '', department: '', consultationFee: '', qualification: '', registrationNumber: '' });
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not create doctor'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    createMutation.mutate();
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
        <input
          type="number"
          step="0.01"
          placeholder="Consultation fee (₹)"
          value={form.consultationFee}
          onChange={(e) => setForm((f) => ({ ...f, consultationFee: e.target.value }))}
          className="rounded-md border border-gray-300 px-3 py-2"
        />
        <input
          placeholder="Qualification (e.g. MBBS, MD)"
          value={form.qualification}
          onChange={(e) => setForm((f) => ({ ...f, qualification: e.target.value }))}
          className="rounded-md border border-gray-300 px-3 py-2"
        />
        <input
          placeholder="Registration no."
          value={form.registrationNumber}
          onChange={(e) => setForm((f) => ({ ...f, registrationNumber: e.target.value }))}
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
                <CredentialsEditor doctorId={d.id} qualification={d.qualification} registrationNumber={d.registrationNumber} />
              </div>
              <div className="flex items-center gap-3">
                <FeeEditor doctorId={d.id} currentFee={d.consultationFee} />
                <button
                  onClick={() => setExpanded(expanded === d.id ? null : d.id)}
                  className="text-sm text-teal hover:underline"
                >
                  {expanded === d.id ? 'Hide schedule' : 'Edit schedule'}
                </button>
              </div>
            </div>
            {expanded === d.id && <ScheduleEditor doctorId={d.id} />}
          </div>
        ))}
      </div>
    </div>
  );
}
