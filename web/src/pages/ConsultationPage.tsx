import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BloodSugarType,
  Consultation,
  FoodTiming,
  LabTestOrderInput,
  PrescriptionInput,
  RadiologyTestOrderInput,
  Vitals,
} from '@opd/shared';
import { getConsultation, saveConsultation, sendVisitSummaryWhatsApp } from '../api/consultations';
import { getAppointment } from '../api/appointments';
import { getPatient, getPatientRecords } from '../api/patients';
import { getCatalogSuggestions } from '../api/catalogue';
import { PatientHistoryPanel } from '../components/PatientHistoryPanel';
import { DietPlanSection } from '../components/DietPlanSection';
import { PreviousVisitSummary } from '../components/PreviousVisitSummary';
import { SuggestInput } from '../components/SuggestInput';
import { Card, Field, btnPrimary, btnSecondary, inputClass } from '../components/ui';
import { Icon } from '../components/Icon';
import { GENDER_LABEL, formatDate } from '../utils/patientFormat';
import { FOOD_TIMING_OPTIONS, bmi, doctorName, totalToDispense, vitalsWarnings } from '../utils/visitFormat';

const small = `${inputClass} py-1.5 text-sm`;

type Row = PrescriptionInput & { key: number };
let rowKey = 0;
const newRow = (p: Partial<PrescriptionInput> = {}): Row => ({
  key: ++rowKey,
  medicine: '',
  strength: '',
  brand: '',
  dosage: '1',
  durationDays: 5,
  foodTiming: null,
  morning: false,
  afternoon: false,
  night: false,
  frequency: '',
  notes: '',
  ...p,
});
const fromSaved = (c: Consultation['prescriptions'][number]): Row =>
  newRow({
    medicine: c.medicine,
    strength: c.strength ?? '',
    brand: c.brand ?? '',
    dosage: c.dosage,
    durationDays: c.durationDays,
    foodTiming: c.foodTiming,
    morning: c.morning,
    afternoon: c.afternoon,
    night: c.night,
    // Only keep a free-text frequency when no ticks describe it.
    frequency: c.morning || c.afternoon || c.night ? '' : c.frequency,
    notes: c.notes ?? '',
  });

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Record (or edit) a consultation: patient banner, vitals, clinical notes,
// prescription, tests, advice and follow-up -- the offline software's
// "Record consultation" screen, plus what the web app already had.
export function ConsultationPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: existing, isFetched: existingLoaded } = useQuery({
    queryKey: ['consultation', appointmentId],
    queryFn: () => getConsultation(appointmentId!),
  });
  const { data: appointment } = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => getAppointment(appointmentId!),
  });
  const patientId = appointment?.patientId;
  const { data: patient } = useQuery({ queryKey: ['patient', patientId], queryFn: () => getPatient(patientId!), enabled: !!patientId });
  const { data: records } = useQuery({
    queryKey: ['patient-records', patientId],
    queryFn: () => getPatientRecords(patientId!),
    enabled: !!patientId,
  });
  const { data: suggestions } = useQuery({ queryKey: ['catalog-suggestions'], queryFn: getCatalogSuggestions });

  // Every generic ("Paracetamol (650 mg)") and every brand ("Dolo 650 —
  // Paracetamol 650 mg") is a suggestion, so typing either finds the
  // medicine; picking a brand also fills the brand box.
  type MedicineOption = { name: string; strength: string | null; brands: string[]; brand?: string };
  const optionsOf = (meds: MedicineOption[]) => {
    const map = new Map<string, MedicineOption>();
    for (const m of meds) map.set(m.strength ? `${m.name} (${m.strength})` : m.name, m);
    for (const m of meds) {
      for (const b of m.brands) map.set(`${b} — ${m.name}${m.strength ? ` ${m.strength}` : ''}`, { ...m, brand: b });
    }
    return map;
  };
  // The clinic's own medicines, then the standard list's behind them.
  const medicineOptions = useMemo(() => optionsOf(suggestions?.medicines ?? []), [suggestions]);
  const standardOptions = useMemo(() => optionsOf(suggestions?.standard?.medicines ?? []), [suggestions]);
  const brandsFor = (name: string, strength?: string | null) => {
    const own = brandsIn(suggestions?.medicines ?? [], name, strength);
    return own.length ? own : brandsIn(suggestions?.standard?.medicines ?? [], name, strength);
  };

  const [fee, setFee] = useState('');
  const [vitals, setVitals] = useState<Vitals>({});
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [presentIllness, setPresentIllness] = useState('');
  const [relevantHistory, setRelevantHistory] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [differentialDiagnosis, setDifferentialDiagnosis] = useState('');
  const [advice, setAdvice] = useState('');
  const [imagingAdvice, setImagingAdvice] = useState('');
  const [doctorNotes, setDoctorNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [labTests, setLabTests] = useState<LabTestOrderInput[]>([]);
  const [radiology, setRadiology] = useState<RadiologyTestOrderInput[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (appointment) setFee(String(appointment.consultationFee));
  }, [appointment]);

  // Load a saved consultation once; a new one starts from the patient's
  // baseline height/weight.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (loaded || !existingLoaded) return;
    if (existing) {
      setVitals(existing.vitals ?? {});
      setChiefComplaint(existing.chiefComplaint ?? '');
      setPresentIllness(existing.presentIllness ?? '');
      setRelevantHistory(existing.relevantHistory ?? '');
      setDiagnosis(existing.diagnosis ?? '');
      setDifferentialDiagnosis(existing.differentialDiagnosis ?? '');
      setAdvice(existing.notes ?? '');
      setImagingAdvice(existing.imagingAdvice ?? '');
      setDoctorNotes(existing.doctorNotes ?? '');
      setFollowUpDate(existing.followUpDate ?? '');
      setRows(existing.prescriptions.map(fromSaved));
      setLabTests(existing.labTestsOrdered.map((o) => ({ testName: o.testName, notes: o.notes ?? '' })));
      setRadiology(existing.radiologyOrdered.map((o) => ({ testName: o.testName, notes: o.notes ?? '' })));
      setLoaded(true);
    } else if (patient) {
      setVitals((v) => ({ heightCm: patient.heightCm ?? undefined, weightKg: patient.weightKg ?? undefined, ...v }));
      setLoaded(true);
    }
  }, [existing, existingLoaded, patient, loaded]);

  // The most recent earlier visit with a prescription, for "Repeat last".
  const lastPrescription = useMemo(() => {
    const earlier = (records?.appointments ?? [])
      .filter((a) => a.id !== appointmentId && a.consultation?.prescriptions.length)
      .sort((a, b) => b.date.localeCompare(a.date) || b.tokenNumber - a.tokenNumber);
    return earlier[0]?.consultation?.prescriptions ?? null;
  }, [records, appointmentId]);

  const save = useMutation({
    mutationFn: (complete: boolean) =>
      saveConsultation(appointmentId!, {
        vitals,
        chiefComplaint,
        presentIllness,
        relevantHistory,
        diagnosis,
        differentialDiagnosis,
        notes: advice,
        imagingAdvice,
        doctorNotes,
        followUpDate,
        consultationFee: fee.trim() === '' ? undefined : Number(fee),
        prescriptions: rows
          .filter((r) => r.medicine.trim())
          .map(({ key: _key, ...r }) => ({ ...r, strength: r.strength || null, brand: r.brand || null, frequency: r.frequency || undefined })),
        labTestsOrdered: labTests.filter((o) => o.testName.trim()),
        radiologyOrdered: radiology.filter((o) => o.testName.trim()),
        complete,
      }),
    onSuccess: (_saved, complete) => {
      queryClient.invalidateQueries({ queryKey: ['consultation', appointmentId] });
      queryClient.invalidateQueries({ queryKey: ['appointment', appointmentId] });
      queryClient.invalidateQueries({ queryKey: ['patient-records', patientId] });
      queryClient.invalidateQueries({ queryKey: ['patient-billing', patientId] });
      if (complete) navigate(`/patients/${patientId}?tab=consultations`);
      else setMessage({ tone: 'ok', text: 'Saved.' });
    },
    onError: (err: any) => setMessage({ tone: 'error', text: err.response?.data?.message ?? 'Could not save the consultation' }),
  });

  const sendSummary = useMutation({
    mutationFn: () => sendVisitSummaryWhatsApp(appointmentId!),
    onSuccess: (n) =>
      setMessage(
        n.status === 'SENT'
          ? { tone: 'ok', text: 'Visit summary sent on WhatsApp.' }
          : { tone: 'error', text: `Not sent: ${n.error}` },
      ),
    onError: (err: any) => setMessage({ tone: 'error', text: err.response?.data?.message ?? 'Could not send' }),
  });

  const setVital = (key: keyof Vitals) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setVitals((v) => ({ ...v, [key]: e.target.value === '' ? undefined : Number(e.target.value) }));
  const vitalInput = (key: keyof Vitals, label: string, step = 'any') => (
    <Field label={label}>
      <input type="number" step={step} inputMode="decimal" value={(vitals[key] as number | undefined) ?? ''} onChange={setVital(key)} className={small} data-testid={`vital-${key}`} />
    </Field>
  );

  const updateRow = (key: number, patch: Partial<PrescriptionInput>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const warnings = vitalsWarnings(vitals);
  const computedBmi = bmi(vitals);
  const saved = !!existing;

  if (!appointment) return <div className="px-6 py-10 text-gray-500">Loading…</div>;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-6">
      {/* Patient banner */}
      <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm" data-testid="consult-banner">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{saved ? 'Edit consultation' : 'Record consultation'}</p>
            <p className="text-lg font-semibold text-gray-900">
              {appointment.patient?.name}{' '}
              {patient && <span className="rounded-md bg-teal-light px-2 py-0.5 font-mono text-sm font-normal text-teal">{patient.patientCode}</span>}
            </p>
            <p className="text-sm text-gray-500">
              {[
                patient?.gender && GENDER_LABEL[patient.gender],
                patient?.age != null && `${patient.age} yrs`,
                patient?.bloodGroup,
                patient?.phone,
                `Visit on ${formatDate(appointment.date)}`,
                appointment.doctor && doctorName(appointment.doctor.user.name),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowHistory((s) => !s)} className={btnSecondary}>
              {showHistory ? 'Hide history' : 'Show history'}
            </button>
            {patientId && (
              <Link to={`/patients/${patientId}`} className={btnSecondary}>
                Profile
              </Link>
            )}
          </div>
        </div>
        {(patient?.allergies || patient?.chronicDiseases) && (
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {patient.allergies && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1 text-red-800" data-testid="consult-allergies">
                <Icon name="alert" className="h-4 w-4" /> Allergies: {patient.allergies}
              </span>
            )}
            {patient.chronicDiseases && (
              <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-amber-900">Chronic: {patient.chronicDiseases}</span>
            )}
          </div>
        )}
      </section>

      {!showHistory && patientId && <PreviousVisitSummary patientId={patientId} currentAppointmentId={appointmentId!} />}

      {showHistory && patientId && (
        <PatientHistoryPanel patientId={patientId} currentAppointmentId={appointmentId!} currentConsultationId={existing?.id} />
      )}

      <div className="space-y-5">
        <Card title="Visit details">
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Date">
              <input readOnly value={formatDate(appointment.date)} className={`${small} bg-gray-50`} />
            </Field>
            <Field label="Token">
              <input readOnly value={`#${appointment.tokenNumber}`} className={`${small} bg-gray-50`} />
            </Field>
            <Field label="Doctor">
              <input readOnly value={appointment.doctor ? doctorName(appointment.doctor.user.name) : ''} className={`${small} bg-gray-50`} />
            </Field>
            <Field label="Consultation fee (₹)" hint="Change for a discount or free review">
              <input type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} className={small} data-testid="consult-fee" />
            </Field>
          </div>
        </Card>

        <Card title="Vitals" subtitle="BMI is worked out from height and weight.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {vitalInput('tempF', 'Temp (°F)', '0.1')}
            {vitalInput('pulse', 'Pulse (bpm)')}
            {vitalInput('bpSystolic', 'BP systolic')}
            {vitalInput('bpDiastolic', 'BP diastolic')}
            {vitalInput('respiratoryRate', 'Resp. rate (/min)')}
            {vitalInput('spo2', 'SpO2 (%)')}
            {vitalInput('heightCm', 'Height (cm)', '0.1')}
            {vitalInput('weightKg', 'Weight (kg)', '0.1')}
            <Field label="BMI">
              <input readOnly value={computedBmi ?? ''} className={`${small} bg-gray-50`} data-testid="bmi" />
            </Field>
            <Field label="Blood sugar (mg/dL)">
              <div className="flex gap-1">
                <input type="number" value={vitals.bloodSugar ?? ''} onChange={setVital('bloodSugar')} className={`${small} min-w-0`} data-testid="vital-bloodSugar" />
                <select
                  aria-label="Blood sugar type"
                  value={vitals.bloodSugarType ?? ''}
                  onChange={(e) => setVitals((v) => ({ ...v, bloodSugarType: (e.target.value || undefined) as BloodSugarType | undefined }))}
                  className={`${small} !w-auto px-1`}
                >
                  <option value="">Type</option>
                  <option value="FASTING">Fasting</option>
                  <option value="PP">PP</option>
                  <option value="RANDOM">Random</option>
                </select>
              </div>
            </Field>
          </div>
          {vitals.tempC != null && vitals.tempF == null && (
            <p className="mt-2 text-xs text-gray-500">Recorded earlier as {vitals.tempC}°C.</p>
          )}
          {warnings.length > 0 && (
            <ul className="mt-3 space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" data-testid="vitals-warnings">
              {warnings.map((w) => (
                <li key={w} className="flex items-start gap-2">
                  <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" /> {w}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Clinical notes">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Chief Complaint / Symptoms" className="sm:col-span-2">
              <textarea rows={2} value={chiefComplaint} onChange={(e) => setChiefComplaint(e.target.value)} className={inputClass} data-testid="chief-complaint" />
            </Field>
            <Field label="History of present illness">
              <textarea rows={2} value={presentIllness} onChange={(e) => setPresentIllness(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Diagnosis">
              <textarea rows={2} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className={inputClass} data-testid="diagnosis" />
            </Field>
          </div>
        </Card>

        <Card
          title="Prescription"
          actions={
            <div className="flex flex-wrap gap-2">
              {lastPrescription && (
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() => setRows((rs) => [...rs.filter((r) => r.medicine.trim()), ...lastPrescription.map(fromSaved)])}
                >
                  Repeat last prescription
                </button>
              )}
              <button type="button" onClick={() => setRows((rs) => [...rs, newRow()])} className={btnSecondary}>
                <Icon name="plus" className="h-4 w-4" /> Add medicine
              </button>
            </div>
          }
        >
          {rows.length === 0 ? (
            <p className="text-sm text-gray-500">No medicines added yet.</p>
          ) : (
            <div className="space-y-3">
              {rows.map((r, i) => {
                const total = totalToDispense(r);
                const ticked = r.morning || r.afternoon || r.night;
                return (
                  <div key={r.key} className="rounded-xl border border-gray-200 p-3" data-testid="prescription-row">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
                      <div className="col-span-2 sm:col-span-3">
                        <SuggestInput
                          placeholder="Medicine or brand"
                          value={r.medicine}
                          onChange={(v) => {
                            const picked = medicineOptions.get(v) ?? standardOptions.get(v);
                            updateRow(
                              r.key,
                              picked
                                ? {
                                    medicine: picked.name,
                                    strength: picked.strength ?? r.strength,
                                    // A picked brand fills the box; picking the generic
                                    // keeps a brand only if it belongs to this medicine.
                                    brand: picked.brand ?? (picked.brands.includes(r.brand ?? '') ? r.brand : ''),
                                  }
                                : { medicine: v },
                            );
                          }}
                          suggestions={[...medicineOptions.keys()]}
                          fallback={[...standardOptions.keys()]}
                          testId={`prescription-medicine-${i}`}
                          className={small}
                        />
                      </div>
                      <input placeholder="Strength" value={r.strength ?? ''} onChange={(e) => updateRow(r.key, { strength: e.target.value })} className={`${small} sm:col-span-2`} aria-label="Strength" />
                      <div className="sm:col-span-2">
                        <SuggestInput
                          placeholder={brandsFor(r.medicine, r.strength).length ? `Brand (${brandsFor(r.medicine, r.strength).length})` : 'Brand'}
                          value={r.brand ?? ''}
                          onChange={(v) => updateRow(r.key, { brand: v })}
                          suggestions={brandsFor(r.medicine, r.strength)}
                          showAllOnFocus
                          testId={`prescription-brand-${i}`}
                          className={small}
                        />
                      </div>
                      <input placeholder="Dose" value={r.dosage} onChange={(e) => updateRow(r.key, { dosage: e.target.value })} className={`${small} sm:col-span-1`} aria-label="Dose per time" title="Dose each time, e.g. 1, ½, 5 ml" />
                      <div className="flex items-center gap-1 sm:col-span-2">
                        <input
                          type="number"
                          min={1}
                          value={r.durationDays}
                          onChange={(e) => updateRow(r.key, { durationDays: Number(e.target.value) })}
                          className={small}
                          aria-label="Days"
                        />
                        <span className="text-xs text-gray-500">days</span>
                      </div>
                      <select
                        value={r.foodTiming ?? ''}
                        onChange={(e) => updateRow(r.key, { foodTiming: (e.target.value || null) as FoodTiming | null })}
                        className={`${small} sm:col-span-2`}
                        aria-label="Food timing"
                      >
                        <option value="">Food timing</option>
                        {FOOD_TIMING_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                      {(['morning', 'afternoon', 'night'] as const).map((t) => (
                        <label key={t} className="flex items-center gap-1.5 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={!!r[t]}
                            onChange={(e) => updateRow(r.key, { [t]: e.target.checked })}
                            className="h-4 w-4 accent-teal"
                            data-testid={`rx-${t}-${i}`}
                          />
                          {t[0]!.toUpperCase() + t.slice(1)}
                        </label>
                      ))}
                      {!ticked && (
                        <input
                          placeholder="or e.g. SOS, 1-1-1"
                          value={r.frequency ?? ''}
                          onChange={(e) => updateRow(r.key, { frequency: e.target.value })}
                          className={`${small} !w-40`}
                          aria-label="Frequency"
                        />
                      )}
                      <input
                        placeholder="Instructions (optional)"
                        value={r.notes ?? ''}
                        onChange={(e) => updateRow(r.key, { notes: e.target.value })}
                        className={`${small} !w-auto min-w-[12rem] flex-1`}
                        aria-label="Instructions"
                      />
                      <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="text-sm text-red-500 hover:text-red-700">
                        Remove
                      </button>
                    </div>
                    {r.medicine.trim() && (
                      <p className="mt-2 text-xs text-gray-500" data-testid={`rx-total-${i}`}>
                        {total != null ? (
                          <>
                            Total to dispense: <span className="font-semibold text-gray-800">{total}</span> × {r.brand || r.medicine}
                            {!r.brand && r.strength ? ` ${r.strength}` : ''}
                          </>
                        ) : (
                          'Tick morning/afternoon/night, or give a frequency such as SOS.'
                        )}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <OrdersCard
          title="Lab tests ordered"
          empty="No tests ordered for this visit."
          addLabel="Add test"
          orders={labTests}
          setOrders={setLabTests}
          suggestions={suggestions?.labTests ?? []}
          fallback={suggestions?.standard?.labTests ?? []}
          testIdPrefix="lab-test-name"
        />
        <OrdersCard
          title="Radiology work prescribed"
          empty="No radiology work prescribed for this visit."
          addLabel="Add radiology work"
          orders={radiology}
          setOrders={setRadiology}
          suggestions={suggestions?.radiology ?? []}
          fallback={suggestions?.standard?.radiology ?? []}
          testIdPrefix="radiology-test-name"
        />

        <Card title="Advice & follow-up">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Advice" className="sm:col-span-2">
              <textarea rows={3} value={advice} onChange={(e) => setAdvice(e.target.value)} className={inputClass} data-testid="advice" />
            </Field>
            <Field label="Ultrasound / imaging advice" className="sm:col-span-2">
              <input value={imagingAdvice} onChange={(e) => setImagingAdvice(e.target.value)} className={inputClass} placeholder="e.g. USG Pelvis recommended" />
            </Field>
            <Field label="Follow-up date" hint="Reminders go out the day before and on the day">
              <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className={inputClass} data-testid="follow-up" />
              <span className="mt-2 flex flex-wrap gap-1.5">
                {[
                  ['3 days', 3],
                  ['1 week', 7],
                  ['2 weeks', 14],
                  ['1 month', 30],
                ].map(([label, days]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setFollowUpDate(addDays(days as number))}
                    className="rounded-full border border-gray-300 px-2.5 py-0.5 text-xs text-gray-600 hover:border-teal hover:text-teal"
                  >
                    +{label}
                  </button>
                ))}
                {followUpDate && (
                  <button type="button" onClick={() => setFollowUpDate('')} className="px-1 text-xs text-gray-500 underline">
                    clear
                  </button>
                )}
              </span>
            </Field>
            <Field label="Doctor notes" hint="Private — never printed or shared with the patient">
              <textarea rows={3} value={doctorNotes} onChange={(e) => setDoctorNotes(e.target.value)} className={`${inputClass} bg-amber-50/40`} />
            </Field>
          </div>
        </Card>

        <DietPlanSection patient={appointment.patient} consultationId={existing?.id} context={`${chiefComplaint}\n${diagnosis}`} />
      </div>

      {/* Sticky actions */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
          {message && (
            <p className={`mr-auto text-sm ${message.tone === 'ok' ? 'text-teal' : 'text-red-600'}`} role="status" data-testid="consult-message">
              {message.text}
            </p>
          )}
          {saved && (
            <>
              <Link to={`/visits/${appointmentId}/print`} className={btnSecondary}>
                Print summary
              </Link>
              <button
                type="button"
                onClick={() => sendSummary.mutate()}
                disabled={sendSummary.isPending || !patient?.whatsappOptIn}
                title={patient?.whatsappOptIn ? undefined : "The patient hasn't agreed to WhatsApp messages"}
                className={btnSecondary}
              >
                Send on WhatsApp
              </button>
            </>
          )}
          <button type="button" onClick={() => save.mutate(false)} disabled={save.isPending} className={`${btnSecondary} ${message ? '' : 'ml-auto'}`}>
            Save draft
          </button>
          <button type="button" onClick={() => save.mutate(true)} disabled={save.isPending} className={btnPrimary} data-testid="save-consultation">
            <Icon name="check" className="h-4 w-4" /> Save consultation
          </button>
        </div>
      </div>
    </div>
  );
}

type Med = { name: string; strength: string | null; brands: string[] };

// A medicine's brands at this strength, or failing an exact strength
// match, the brands of any strength of it.
function brandsIn(meds: Med[], name: string, strength?: string | null): string[] {
  const n = name.trim().toLowerCase();
  const exact = meds.find((m) => m.name.toLowerCase() === n && (m.strength ?? '').toLowerCase() === (strength ?? '').trim().toLowerCase());
  return exact ? exact.brands : [...new Set(meds.filter((m) => m.name.toLowerCase() === n).flatMap((m) => m.brands))];
}

function OrdersCard({
  title,
  empty,
  addLabel,
  orders,
  setOrders,
  suggestions,
  fallback,
  testIdPrefix,
}: {
  title: string;
  empty: string;
  addLabel: string;
  orders: LabTestOrderInput[];
  setOrders: React.Dispatch<React.SetStateAction<LabTestOrderInput[]>>;
  suggestions: string[];
  fallback: string[];
  testIdPrefix: string;
}) {
  const update = (i: number, patch: Partial<LabTestOrderInput>) => setOrders((os) => os.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  return (
    <Card
      title={title}
      actions={
        <button type="button" onClick={() => setOrders((os) => [...os, { testName: '', notes: '' }])} className={btnSecondary}>
          <Icon name="plus" className="h-4 w-4" /> {addLabel}
        </button>
      }
    >
      {orders.length === 0 ? (
        <p className="text-sm text-gray-500">{empty}</p>
      ) : (
        <div className="space-y-2">
          {orders.map((o, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
              <div className="sm:col-span-5">
                <SuggestInput
                  placeholder="Test name"
                  value={o.testName}
                  onChange={(v) => update(i, { testName: v })}
                  suggestions={suggestions}
                  fallback={fallback}
                  testId={`${testIdPrefix}-${i}`}
                  className={small}
                />
              </div>
              <input placeholder="Notes (optional)" value={o.notes ?? ''} onChange={(e) => update(i, { notes: e.target.value })} className={`${small} sm:col-span-6`} />
              <button type="button" onClick={() => setOrders((os) => os.filter((_, j) => j !== i))} className="text-sm text-red-500 hover:text-red-700 sm:col-span-1">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
