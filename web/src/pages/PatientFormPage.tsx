import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Gender, Patient, PatientDetailsInput } from '@opd/shared';
import { getPatient, registerPatient, updatePatient } from '../api/patients';
import { usePatientSearch } from '../components/PatientSearch';
import { Card, Field, PageHeader, btnPrimary, inputClass } from '../components/ui';
import { Icon } from '../components/Icon';
import { ageFromDob } from '../utils/patientFormat';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const MARITAL = ['Single', 'Married', 'Divorced', 'Widowed'];

type Form = Record<Exclude<keyof PatientDetailsInput, 'whatsappOptIn'>, string> & { whatsappOptIn: boolean };

const EMPTY: Form = {
  firstName: '',
  middleName: '',
  lastName: '',
  gender: '',
  dateOfBirth: '',
  ageYears: '',
  bloodGroup: '',
  maritalStatus: '',
  nationality: 'Indian',
  phone: '',
  alternatePhone: '',
  email: '',
  emergencyContact: '',
  occupation: '',
  referredBy: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  heightCm: '',
  weightKg: '',
  allergies: '',
  chronicDiseases: '',
  pastSurgeries: '',
  familyHistory: '',
  insuranceDetails: '',
  tpa: '',
  doctorNotes: '',
  whatsappOptIn: false,
};

function fromPatient(p: Patient): Form {
  const s = (v: string | number | null) => (v == null ? '' : String(v));
  return {
    firstName: p.firstName,
    middleName: s(p.middleName),
    lastName: s(p.lastName),
    gender: s(p.gender),
    dateOfBirth: s(p.dateOfBirth),
    // With a DOB the age is derived; without one, the current age stands in.
    ageYears: p.dateOfBirth ? '' : s(p.age),
    bloodGroup: s(p.bloodGroup),
    maritalStatus: s(p.maritalStatus),
    nationality: s(p.nationality),
    phone: s(p.phone),
    alternatePhone: s(p.alternatePhone),
    email: s(p.email),
    emergencyContact: s(p.emergencyContact),
    occupation: s(p.occupation),
    referredBy: s(p.referredBy),
    address: s(p.address),
    city: s(p.city),
    state: s(p.state),
    pincode: s(p.pincode),
    heightCm: s(p.heightCm),
    weightKg: s(p.weightKg),
    allergies: s(p.allergies),
    chronicDiseases: s(p.chronicDiseases),
    pastSurgeries: s(p.pastSurgeries),
    familyHistory: s(p.familyHistory),
    insuranceDetails: s(p.insuranceDetails),
    tpa: s(p.tpa),
    doctorNotes: s(p.doctorNotes),
    whatsappOptIn: p.whatsappOptIn,
  };
}

function toPayload(f: Form, editing: Patient | undefined): PatientDetailsInput {
  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  const ageChanged = !editing || f.ageYears !== fromPatient(editing).ageYears;
  return {
    ...f,
    gender: (f.gender || null) as Gender | null,
    dateOfBirth: f.dateOfBirth || null,
    // Re-sending an unchanged age would restart its clock; only send it
    // when the desk actually typed one.
    ageYears: f.dateOfBirth ? null : ageChanged ? num(f.ageYears) : undefined,
    heightCm: num(f.heightCm),
    weightKg: num(f.weightKg),
    email: f.email.trim() || null,
    // Consent is only ever turned on from here.
    whatsappOptIn: f.whatsappOptIn || undefined,
  };
}

// Registration (/patients/new) and "Edit details" (/patients/:id/edit):
// one long page of sections, only first name and mobile required.
export function PatientFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const { data: existing } = useQuery({ queryKey: ['patient', id], queryFn: () => getPatient(id!), enabled: !!id });
  useEffect(() => {
    if (existing) setForm(fromPatient(existing));
  }, [existing]);

  // Family members often share a mobile: say who else uses the number so
  // the desk can open that record instead of registering a duplicate.
  const phoneDigits = form.phone.replace(/\D/g, '');
  const { data: samePhone } = usePatientSearch(phoneDigits.length >= 10 ? phoneDigits : '');
  const others = (phoneDigits.length >= 10 ? samePhone ?? [] : []).filter((p) => p.id !== id);

  const save = useMutation({
    mutationFn: (payload: PatientDetailsInput) => (id ? updatePatient(id, payload) : registerPatient(payload)),
    onSuccess: (patient) => {
      queryClient.setQueryData(['patient', patient.id], patient);
      queryClient.invalidateQueries({ queryKey: ['patient-search'] });
      queryClient.invalidateQueries({ queryKey: ['recent-patients'] });
      navigate(`/patients/${patient.id}`);
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not save the patient'),
  });

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    save.mutate(toPayload(form, existing));
  }

  const dobAge = form.dateOfBirth ? ageFromDob(form.dateOfBirth) : null;
  const text = (key: keyof Form, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input value={form[key] as string} onChange={set(key)} className={inputClass} {...props} />
  );
  const area = (key: keyof Form) => (
    <textarea value={form[key] as string} onChange={set(key)} rows={2} className={inputClass} />
  );

  if (id && !existing) return <div className="px-6 py-10 text-gray-500">Loading…</div>;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader
        title={id ? `Edit ${existing!.name}` : 'Register new patient'}
        subtitle={
          id
            ? `Patient ID ${existing!.patientCode}`
            : 'A Patient ID is created automatically on save. Only first name and mobile are required.'
        }
      />
      <form onSubmit={submit} className="space-y-5" data-testid="patient-form">
        <Card title="Identity">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="First name" required>
              {text('firstName', { required: true, autoFocus: !id, 'data-testid': 'first-name' } as any)}
            </Field>
            <Field label="Middle name">{text('middleName')}</Field>
            <Field label="Last name">{text('lastName', { 'data-testid': 'last-name' } as any)}</Field>
            <Field label="Gender">
              <select value={form.gender} onChange={set('gender')} className={inputClass} data-testid="gender">
                <option value="">Select</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </Field>
            <Field label="Date of birth" hint={dobAge != null ? `Age ${dobAge} years` : undefined}>
              {text('dateOfBirth', { type: 'date', max: new Date().toISOString().slice(0, 10), 'data-testid': 'dob' } as any)}
            </Field>
            <Field label="Age (years)" hint={form.dateOfBirth ? 'Worked out from the date of birth' : "If the date of birth isn't known"}>
              {text('ageYears', {
                type: 'number',
                min: 0,
                max: 130,
                disabled: !!form.dateOfBirth,
                'data-testid': 'age',
              } as any)}
            </Field>
            <Field label="Blood group">
              <select value={form.bloodGroup} onChange={set('bloodGroup')} className={inputClass}>
                <option value="">Select</option>
                {BLOOD_GROUPS.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </Field>
            <Field label="Marital status">
              <select value={form.maritalStatus} onChange={set('maritalStatus')} className={inputClass}>
                <option value="">Select</option>
                {MARITAL.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
            <Field label="Nationality">{text('nationality')}</Field>
          </div>
        </Card>

        <Card title="Contact" subtitle="The mobile number is used for fast lookup and WhatsApp messages.">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Mobile number" required>
              {text('phone', { required: true, type: 'tel', inputMode: 'tel', 'data-testid': 'phone' } as any)}
            </Field>
            <Field label="Alternate mobile">{text('alternatePhone', { type: 'tel', inputMode: 'tel' })}</Field>
            <Field label="Email">{text('email', { type: 'email' })}</Field>
            <Field label="Emergency contact" hint="Name & number">
              {text('emergencyContact')}
            </Field>
            <Field label="Occupation">{text('occupation')}</Field>
            <Field label="Referred by">{text('referredBy')}</Field>
          </div>
          {others.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="same-phone">
              <p className="flex items-center gap-2 font-medium">
                <Icon name="alert" className="h-4 w-4" /> Also registered on this number:
              </p>
              <ul className="mt-1 space-y-0.5">
                {others.map((p) => (
                  <li key={p.id}>
                    <Link to={`/patients/${p.id}`} className="underline">
                      {p.name}
                    </Link>{' '}
                    <span className="font-mono text-xs">{p.patientCode}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs">Family members can share a number — save to register a separate patient.</p>
            </div>
          )}
          <label className="mt-4 flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.whatsappOptIn}
              disabled={!!existing?.whatsappOptIn}
              onChange={set('whatsappOptIn')}
              className="mt-0.5 h-4 w-4 accent-teal"
            />
            <span>
              Patient agrees to receive prescriptions and reminders on WhatsApp
              {existing?.whatsappOptIn && <span className="text-gray-500"> (already agreed)</span>}
            </span>
          </label>
        </Card>

        <Card title="Address">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Address" className="sm:col-span-3">
              {area('address')}
            </Field>
            <Field label="City">{text('city')}</Field>
            <Field label="State">{text('state')}</Field>
            <Field label="Pincode">{text('pincode', { inputMode: 'numeric' })}</Field>
          </div>
        </Card>

        <Card title="Medical background" subtitle="Baseline information doctors refer to at every visit.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Height (cm)">{text('heightCm', { type: 'number', step: '0.1', min: 0 })}</Field>
            <Field label="Weight (kg)">{text('weightKg', { type: 'number', step: '0.1', min: 0 })}</Field>
            <Field label="Known allergies">{area('allergies')}</Field>
            <Field label="Chronic diseases">{area('chronicDiseases')}</Field>
            <Field label="Past surgeries">{area('pastSurgeries')}</Field>
            <Field label="Family history">{area('familyHistory')}</Field>
          </div>
        </Card>

        <Card title="Additional">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Insurance details" className="sm:col-span-2">
              {area('insuranceDetails')}
            </Field>
            <Field label="TPA" hint="Insurance administrator, e.g. MediAssist, Paramount">
              {text('tpa')}
            </Field>
            <Field label="Doctor notes">{area('doctorNotes')}</Field>
          </div>
        </Card>

        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <div className="flex items-center gap-4">
          <button type="submit" disabled={save.isPending} className={btnPrimary} data-testid="save-patient">
            <Icon name="check" className="h-4 w-4" />
            {save.isPending ? 'Saving…' : id ? 'Save changes' : 'Save patient'}
          </button>
          <button type="button" onClick={() => navigate(-1)} className="text-sm text-gray-600 hover:text-teal">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
