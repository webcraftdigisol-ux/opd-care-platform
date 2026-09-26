import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Appointment, AppointmentStatus, PatientSearchResult } from '@opd/shared';
import {
  listDayAppointments,
  registerBooking,
  rescheduleAppointment,
  scheduleAppointment,
  updateAppointmentStatus,
} from '../api/appointments';
import { listDoctors } from '../api/doctors';
import { useAuth } from '../context/AuthContext';
import { AppointmentPerson } from '../components/AppointmentPerson';
import { PatientResultRow, PatientSearch, usePatientSearch } from '../components/PatientSearch';
import { StatusBadge } from '../components/StatusBadge';
import { Field, Modal, PageHeader, btnPrimary, btnSecondary, inputClass } from '../components/ui';
import { Icon } from '../components/Icon';
import { doctorName } from '../utils/visitFormat';

// The clinic's calendar day in the browser's own time zone.
export function localDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
}

function dayLabel(date: string): string {
  const today = localDate();
  const d = new Date(`${date}T12:00:00`);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const long = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
  if (date === today) return `Today · ${long}`;
  if (date === shiftDate(today, 1)) return `Tomorrow · ${long}`;
  if (date === shiftDate(today, -1)) return `Yesterday · ${long}`;
  return long;
}

const small = 'rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:border-teal hover:text-teal disabled:opacity-50';

// Book and track appointments, one day at a time: a day navigator, an
// optional doctor filter, and each booking's next steps right on its row.
export function AppointmentsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? localDate();
  const doctorFilter = params.get('doctor') ?? '';
  const [booking, setBooking] = useState(params.get('book') === '1');
  const [moving, setMoving] = useState<Appointment | null>(null);
  const [registering, setRegistering] = useState<Appointment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDesk = user?.role === 'ADMIN' || user?.role === 'RECEPTIONIST';
  const canConsult = user?.role === 'ADMIN' || user?.role === 'DOCTOR';
  const { data: doctors } = useQuery({ queryKey: ['doctors'], queryFn: listDoctors });
  const { data: appointments, isLoading } = useQuery({
    queryKey: ['day-appointments', date, doctorFilter],
    queryFn: () => listDayAppointments(date, doctorFilter || undefined),
    refetchInterval: 20_000,
  });

  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value) next.set(key, value);
        else next.delete(key);
        next.delete('book');
        return next;
      },
      { replace: true },
    );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['day-appointments'] });
    queryClient.invalidateQueries({ queryKey: ['admin-appointments'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AppointmentStatus }) => updateAppointmentStatus(id, status),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not update the appointment'),
  });

  const visible = (appointments ?? []).filter((a) => a.status !== 'CANCELLED');
  const cancelled = (appointments ?? []).filter((a) => a.status === 'CANCELLED');

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Appointments"
        subtitle="Book and track patient appointments."
        actions={
          <button type="button" onClick={() => setBooking(true)} className={btnPrimary} data-testid="schedule-appointment">
            <Icon name="plus" className="h-4 w-4" /> Schedule appointment
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
        <button type="button" onClick={() => setParam('date', shiftDate(date, -1))} className="rounded-lg p-2 text-gray-600 hover:bg-gray-100" aria-label="Previous day">
          <Icon name="chevronLeft" className="h-5 w-5" />
        </button>
        <p className="min-w-0 flex-1 truncate text-center font-medium text-gray-900" data-testid="day-label">
          {dayLabel(date)}
        </p>
        <button type="button" onClick={() => setParam('date', shiftDate(date, 1))} className="rounded-lg p-2 text-gray-600 hover:bg-gray-100" aria-label="Next day">
          <Icon name="chevronRight" className="h-5 w-5" />
        </button>
        <input type="date" value={date} onChange={(e) => e.target.value && setParam('date', e.target.value)} className="basis-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm sm:basis-auto" aria-label="Pick a day" />
        {date !== localDate() && (
          <button type="button" onClick={() => setParam('date', null)} className="text-sm font-medium text-teal hover:underline">
            Today
          </button>
        )}
        {doctors && doctors.length > 1 && (
          <select value={doctorFilter} onChange={(e) => setParam('doctor', e.target.value || null)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" aria-label="Doctor">
            <option value="">All doctors</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {doctorName(d.user.name)}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        {isLoading ? (
          <p className="p-6 text-sm text-gray-500">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="p-10 text-center text-sm text-gray-500">No appointments scheduled for this day.</p>
        ) : (
          <ul className="divide-y divide-gray-100" data-testid="appointment-list">
            {visible.map((a) => {
              const guest = !a.patientId;
              const open = ['BOOKED', 'CHECKED_IN'].includes(a.status);
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3" data-testid="appointment-row">
                  <span className="w-16 shrink-0 text-center">
                    <span className="block rounded-lg bg-teal-light px-2 py-1 text-sm font-semibold text-teal">{a.startTime ?? `#${a.tokenNumber}`}</span>
                    {a.startTime && <span className="text-[11px] text-gray-400">Token {a.tokenNumber}</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <AppointmentPerson appointment={a} />
                    <span className="block text-xs text-gray-500">
                      {[a.doctor && doctorName(a.doctor.user.name), a.reason, a.isWalkIn ? 'Walk-in' : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <StatusBadge status={a.status} />
                  <span className="flex flex-wrap gap-1.5">
                    {guest && open && isDesk && (
                      <button type="button" className={`${small} border-teal text-teal`} onClick={() => setRegistering(a)}>
                        Register & check in
                      </button>
                    )}
                    {!guest && a.status === 'BOOKED' && isDesk && (
                      <button type="button" className={small} onClick={() => setStatus.mutate({ id: a.id, status: 'CHECKED_IN' })}>
                        Check in
                      </button>
                    )}
                    {!guest && canConsult && open && (
                      <button type="button" className={`${small} border-teal text-teal`} onClick={() => navigate(`/doctor/consult/${a.id}`)}>
                        Start consultation
                      </button>
                    )}
                    {a.status === 'IN_CONSULTATION' && canConsult && (
                      <Link to={`/doctor/consult/${a.id}`} className={small}>
                        Open consultation
                      </Link>
                    )}
                    {!guest && open && (
                      <button type="button" className={small} onClick={() => setStatus.mutate({ id: a.id, status: 'COMPLETED' })}>
                        ✓ Completed
                      </button>
                    )}
                    {open && (
                      <button type="button" className={small} onClick={() => setStatus.mutate({ id: a.id, status: 'NO_SHOW' })}>
                        No-show
                      </button>
                    )}
                    {a.status === 'BOOKED' && (
                      <>
                        <button type="button" className={small} onClick={() => setMoving(a)}>
                          Reschedule
                        </button>
                        <button type="button" className={`${small} hover:border-red-400 hover:text-red-600`} onClick={() => setStatus.mutate({ id: a.id, status: 'CANCELLED' })}>
                          Cancel
                        </button>
                      </>
                    )}
                    {a.consultation && (
                      <Link to={`/visits/${a.id}/print`} className={small}>
                        Summary
                      </Link>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {cancelled.length > 0 && <p className="mt-2 text-xs text-gray-400">{cancelled.length} cancelled not shown.</p>}

      {booking && (
        <BookingDialog
          date={date}
          defaultDoctorId={doctorFilter}
          onClose={() => {
            setBooking(false);
            if (params.get('book')) setParam('book', null);
          }}
          onBooked={(a) => {
            setBooking(false);
            refresh();
            setParam('date', a.date === localDate() ? null : a.date);
          }}
        />
      )}
      {moving && <RescheduleDialog appointment={moving} onClose={() => setMoving(null)} onDone={() => (setMoving(null), refresh())} />}
      {registering && (
        <RegisterDialog appointment={registering} onClose={() => setRegistering(null)} onDone={() => (setRegistering(null), refresh())} />
      )}
    </div>
  );
}

function useDoctorChoice(defaultDoctorId: string) {
  const { user } = useAuth();
  const { data: doctors } = useQuery({ queryKey: ['doctors'], queryFn: listDoctors });
  const [doctorId, setDoctorId] = useState(defaultDoctorId);
  useEffect(() => {
    if (doctorId || !doctors) return;
    const mine = doctors.find((d) => d.userId === user?.id);
    if (mine) setDoctorId(mine.id);
    else if (doctors.length === 1) setDoctorId(doctors[0]!.id);
  }, [doctors, doctorId, user]);
  return { doctors: doctors ?? [], doctorId, setDoctorId };
}

// Search first; "Not registered yet?" switches to name + optional mobile.
function BookingDialog({
  date: initialDate,
  defaultDoctorId,
  onClose,
  onBooked,
}: {
  date: string;
  defaultDoctorId: string;
  onClose: () => void;
  onBooked: (a: Appointment) => void;
}) {
  const [patient, setPatient] = useState<PatientSearchResult | null>(null);
  const [guest, setGuest] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [date, setDate] = useState(initialDate < localDate() ? localDate() : initialDate);
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { doctors, doctorId, setDoctorId } = useDoctorChoice(defaultDoctorId);

  const book = useMutation({
    mutationFn: () =>
      scheduleAppointment({
        doctorId,
        date,
        time: time || null,
        reason: reason || undefined,
        ...(guest ? { guestName, guestPhone: guestPhone || undefined } : { patientId: patient!.id }),
      }),
    onSuccess: onBooked,
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not schedule the appointment'),
  });

  const who = guest ? guestName.trim().length >= 2 : !!patient;
  const ready = who && !!doctorId && !!date;

  return (
    <Modal title="Schedule appointment" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (ready) book.mutate();
        }}
        className="space-y-4"
      >
        {guest ? (
          <div className="space-y-3 rounded-xl bg-gray-50 p-3">
            <p className="text-sm text-gray-600">
              Booking for someone not registered yet ·{' '}
              <button type="button" onClick={() => setGuest(false)} className="font-medium text-teal hover:underline">
                Search instead
              </button>
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" required>
                <input autoFocus value={guestName} onChange={(e) => setGuestName(e.target.value)} className={inputClass} data-testid="guest-name" />
              </Field>
              <Field label="Mobile">
                <input type="tel" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} className={inputClass} data-testid="guest-phone" />
              </Field>
            </div>
          </div>
        ) : patient ? (
          <div className="flex items-center justify-between rounded-xl border border-teal/30 bg-teal-light/50 p-3" data-testid="booking-patient">
            <span>
              <span className="font-medium text-gray-900">{patient.name}</span>{' '}
              <span className="rounded bg-white px-1.5 py-0.5 font-mono text-xs text-gray-600">{patient.patientCode}</span>
              {patient.phone && <span className="block text-xs text-gray-500">{patient.phone}</span>}
            </span>
            <button type="button" onClick={() => setPatient(null)} className="text-sm font-medium text-teal hover:underline">
              Change
            </button>
          </div>
        ) : (
          <div>
            <PatientSearch autoFocus onSelect={setPatient} placeholder="Search patient by name, mobile or Patient ID" />
            <button type="button" onClick={() => setGuest(true)} className="mt-2 text-sm text-teal hover:underline" data-testid="book-unregistered">
              Not registered yet? Book by name and mobile instead
            </button>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date" required>
            <input type="date" required min={localDate()} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} data-testid="booking-date" />
          </Field>
          <Field label="Time" hint="Optional">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} data-testid="booking-time" />
          </Field>
          <Field label="Doctor" required>
            <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className={inputClass} data-testid="booking-doctor">
              <option value="">Select a doctor</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {doctorName(d.user.name)} — {d.specialization}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reason" hint="Optional — follow-up, new consultation…">
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
          </Field>
        </div>
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" disabled={!ready || book.isPending} className={btnPrimary} data-testid="confirm-booking">
            Schedule appointment
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RescheduleDialog({ appointment: a, onClose, onDone }: { appointment: Appointment; onClose: () => void; onDone: () => void }) {
  const [date, setDate] = useState(a.date);
  const [time, setTime] = useState(a.startTime ?? '');
  const { doctors, doctorId, setDoctorId } = useDoctorChoice(a.doctorId);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => rescheduleAppointment(a.id, { date, time: time || null, ...(doctorId !== a.doctorId ? { doctorId } : {}) }),
    onSuccess: onDone,
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not reschedule'),
  });
  return (
    <Modal title={`Reschedule ${a.patient?.name ?? a.guestName ?? ''}`} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date">
          <input type="date" min={localDate()} value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Time" hint="Optional">
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Doctor" className="sm:col-span-2">
          <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className={inputClass}>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {doctorName(d.user.name)} — {d.specialization}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={btnSecondary}>
          Cancel
        </button>
        <button type="button" onClick={() => save.mutate()} disabled={save.isPending} className={btnPrimary}>
          Save
        </button>
      </div>
    </Modal>
  );
}

// On arrival: match the booking to a registered patient on the same mobile
// (a family member), or register them as new from the booking's details.
function RegisterDialog({ appointment: a, onClose, onDone }: { appointment: Appointment; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(a.guestName ?? '');
  const [phone, setPhone] = useState(a.guestPhone ?? '');
  const [error, setError] = useState<string | null>(null);
  const checkIn = a.date <= localDate();
  const digits = phone.replace(/\D/g, '');
  const { data: samePhone } = usePatientSearch(digits.length >= 10 ? digits : '');
  const matches = digits.length >= 10 ? samePhone ?? [] : [];

  const register = useMutation({
    mutationFn: (patientId?: string) => registerBooking(a.id, patientId ? { patientId, checkIn } : { name, phone, checkIn }),
    onSuccess: onDone,
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not register'),
  });

  return (
    <Modal title="Register & check in" onClose={onClose}>
      {matches.length > 0 && (
        <div className="mb-4">
          <p className="mb-1 text-sm font-medium text-gray-700">Already registered on this mobile — is it one of them?</p>
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200" data-testid="register-matches">
            {matches.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => register.mutate(p.id)} className="block w-full text-left hover:bg-gray-50">
                  <PatientResultRow p={p} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mb-2 text-sm font-medium text-gray-700">{matches.length ? 'Or register as a new patient' : 'Register as a new patient'}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Mobile" required>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} data-testid="register-phone" />
        </Field>
      </div>
      <p className="mt-2 text-xs text-gray-500">Gets a Patient ID now; the rest can be filled in from their profile.</p>
      {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={btnSecondary}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => register.mutate(undefined)}
          disabled={register.isPending || name.trim().length < 2 || digits.length < 6}
          className={btnPrimary}
          data-testid="register-new"
        >
          {checkIn ? 'Register & check in' : 'Register'}
        </button>
      </div>
    </Modal>
  );
}
