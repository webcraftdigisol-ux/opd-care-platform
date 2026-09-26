import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Appointment } from '@opd/shared';
import { listDoctors } from '../api/doctors';
import { registerWalkIn } from '../api/appointments';
import { getPatient } from '../api/patients';
import { PatientSearch } from '../components/PatientSearch';
import { Card, Field, PageHeader, btnPrimary, inputClass } from '../components/ui';
import { Icon } from '../components/Icon';
import { sexAge } from '../utils/patientFormat';

// Search first: a registered patient is picked from the search (never
// matched by phone -- family members share numbers). Someone new can be
// quick-registered with just a name and mobile and completed later from
// their profile.
export function AdminWalkInPage() {
  const [params, setParams] = useSearchParams();
  const patientId = params.get('patientId');
  const queryClient = useQueryClient();
  const { data: doctors } = useQuery({ queryKey: ['doctors'], queryFn: listDoctors });
  const { data: patient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => getPatient(patientId!),
    enabled: !!patientId,
  });
  const [doctorId, setDoctorId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [reason, setReason] = useState('');
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<Appointment | null>(null);

  // A clinic with one doctor needn't pick.
  useEffect(() => {
    if (doctors?.length === 1 && !doctorId) setDoctorId(doctors[0]!.id);
  }, [doctors, doctorId]);

  const walkInMutation = useMutation({
    mutationFn: registerWalkIn,
    onSuccess: (appointment) => {
      setBooked(appointment);
      setPatientName('');
      setPatientPhone('');
      setReason('');
      setWhatsappOptIn(false);
      setParams({}, { replace: true });
      queryClient.invalidateQueries({ queryKey: ['patient-search'] });
      queryClient.invalidateQueries({ queryKey: ['recent-patients'] });
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not register walk-in'),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBooked(null);
    if (!doctorId) {
      setError('Please select a doctor');
      return;
    }
    walkInMutation.mutate({
      doctorId,
      ...(patientId ? { patientId } : { patientName, patientPhone }),
      reason: reason || undefined,
      whatsappOptIn,
    });
  }

  const alreadyOptedIn = !!patient?.whatsappOptIn;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <PageHeader title="Walk-in" subtitle="Find the patient, pick the doctor, and hand over a token." />

      {booked && (
        <div className="mb-5 rounded-2xl border border-teal/30 bg-teal-light p-4 text-teal" data-testid="walkin-success">
          <p className="text-lg">
            Registered! Token number <span className="font-bold">#{booked.tokenNumber}</span>
          </p>
          <p className="mt-1 text-sm">
            {booked.patient?.name}
            {booked.patient?.patientCode && <span className="font-mono"> · {booked.patient.patientCode}</span>} ·{' '}
            <Link to={`/patients/${booked.patientId}`} className="font-medium underline">
              Open profile
            </Link>
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card title="Patient">
          {patientId ? (
            patient ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-teal/30 bg-teal-light/50 p-3" data-testid="walkin-selected">
                <span>
                  <span className="font-medium text-gray-900">{patient.name}</span>{' '}
                  <span className="rounded bg-white px-1.5 py-0.5 font-mono text-xs text-gray-600">{patient.patientCode}</span>
                  <span className="block text-sm text-gray-500">
                    {[sexAge(patient.gender, patient.age), patient.phone].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <button type="button" onClick={() => setParams({}, { replace: true })} className="text-sm font-medium text-teal hover:underline">
                  Change
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Loading patient…</p>
            )
          ) : (
            <>
              <PatientSearch onSelect={(p) => setParams({ patientId: p.id }, { replace: true })} />
              <div className="my-4 flex items-center gap-3 text-xs uppercase tracking-wide text-gray-400">
                <span className="h-px flex-1 bg-gray-200" /> or register someone new <span className="h-px flex-1 bg-gray-200" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Patient name" required>
                  <input
                    required
                    data-testid="walkin-patient-name"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Mobile number" required>
                  <input
                    required
                    type="tel"
                    data-testid="walkin-patient-phone"
                    value={patientPhone}
                    onChange={(e) => setPatientPhone(e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                Gets a new Patient ID. Fill in the rest later from the profile, or use{' '}
                <Link to="/patients/new" className="text-teal underline">
                  full registration
                </Link>
                .
              </p>
            </>
          )}
        </Card>

        <Card title="Visit">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Doctor" required>
              <select
                required
                data-testid="walkin-doctor"
                value={doctorId}
                onChange={(e) => setDoctorId(e.target.value)}
                className={inputClass}
              >
                <option value="">Select a doctor</option>
                {doctors?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.user.name} — {d.specialization}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reason">
              <input data-testid="walkin-reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
            </Field>
          </div>
          {!alreadyOptedIn && (
            <label className="mt-4 flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                data-testid="walkin-whatsapp-optin"
                checked={whatsappOptIn}
                onChange={(e) => setWhatsappOptIn(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-teal"
              />
              <span>
                Patient agrees to receive prescriptions and reminders on WhatsApp at this number
                <span className="block text-xs text-gray-500">Ask the patient first. They can turn this off later.</span>
              </span>
            </label>
          )}
        </Card>

        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" data-testid="walkin-error">
            {error}
          </p>
        )}
        <button type="submit" disabled={walkInMutation.isPending} className={`${btnPrimary} w-full py-2.5`}>
          <Icon name="check" className="h-4 w-4" />
          {walkInMutation.isPending ? 'Registering…' : 'Register & Assign Token'}
        </button>
      </form>
    </div>
  );
}
