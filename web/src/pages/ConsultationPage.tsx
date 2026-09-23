import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getConsultation, saveConsultation } from '../api/consultations';
import { getAppointment } from '../api/appointments';
import { createDietPlan, listDietPlans, sendDietPlanWhatsApp, sendPrescriptionWhatsApp } from '../api/dietplans';
import { listPharmacyItems } from '../api/pharmacy';
import { listLabCatalog } from '../api/lab';
import { listRadiologyCatalog } from '../api/radiology';
import { AttachmentPanel } from '../components/AttachmentPanel';
import { SuggestInput } from '../components/SuggestInput';
import { useAuth } from '../context/AuthContext';
import type { DietaryPreference, LabTestOrderInput, PrescriptionInput, RadiologyTestOrderInput, Vitals } from '@opd/shared';

const DIETARY_PREFERENCE_OPTIONS: { value: DietaryPreference; label: string }[] = [
  { value: 'VEG', label: 'Vegetarian' },
  { value: 'NON_VEG', label: 'Non-vegetarian' },
  { value: 'EGGETARIAN', label: 'Eggetarian' },
  { value: 'VEGAN', label: 'Vegan' },
];

export function ConsultationPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const navigate = useNavigate();
  const { clinic } = useAuth();
  const queryClient = useQueryClient();

  const { data: existing } = useQuery({
    queryKey: ['consultation', appointmentId],
    queryFn: () => getConsultation(appointmentId!),
    enabled: !!appointmentId,
  });

  const { data: appointment } = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => getAppointment(appointmentId!),
    enabled: !!appointmentId,
  });
  const patient = appointment?.patient;

  const { data: dietPlans } = useQuery({
    queryKey: ['diet-plans', patient?.id],
    queryFn: () => listDietPlans(patient!.id),
    enabled: !!patient,
  });

  // Pharmacy/lab/radiology catalogs only exist for a Tier 2+ clinic
  // (the endpoints themselves 403 below that) -- same tier gate the Lab
  // Tests Ordered / Radiology Ordered sections below already use.
  const tierAllowsCatalogs = (clinic?.tier ?? 1) >= 2;
  const { data: pharmacyItems } = useQuery({
    queryKey: ['pharmacy-items'],
    queryFn: listPharmacyItems,
    enabled: tierAllowsCatalogs,
  });
  const { data: labCatalog } = useQuery({
    queryKey: ['lab-catalog'],
    queryFn: listLabCatalog,
    enabled: tierAllowsCatalogs,
  });
  const { data: radiologyCatalog } = useQuery({
    queryKey: ['radiology-catalog'],
    queryFn: listRadiologyCatalog,
    enabled: tierAllowsCatalogs,
  });
  const medicineNames = pharmacyItems?.map((i) => i.name) ?? [];
  const labTestNames = labCatalog?.map((c) => c.name) ?? [];
  const radiologyTestNames = radiologyCatalog?.map((c) => c.name) ?? [];

  const [vitals, setVitals] = useState<Vitals>({});
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [prescriptions, setPrescriptions] = useState<PrescriptionInput[]>([]);
  const [labTestsOrdered, setLabTestsOrdered] = useState<LabTestOrderInput[]>([]);
  const [radiologyOrdered, setRadiologyOrdered] = useState<RadiologyTestOrderInput[]>([]);

  useEffect(() => {
    if (existing) {
      setVitals(existing.vitals ?? {});
      setDiagnosis(existing.diagnosis ?? '');
      setNotes(existing.notes ?? '');
      setFollowUpDate(existing.followUpDate ?? '');
      setPrescriptions(
        existing.prescriptions.map((p) => ({
          medicine: p.medicine,
          dosage: p.dosage,
          frequency: p.frequency,
          durationDays: p.durationDays,
          notes: p.notes ?? undefined,
        })),
      );
      setLabTestsOrdered(
        existing.labTestsOrdered.map((o) => ({ testName: o.testName, notes: o.notes ?? undefined })),
      );
      setRadiologyOrdered(
        existing.radiologyOrdered.map((o) => ({ testName: o.testName, notes: o.notes ?? undefined })),
      );
    }
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: (complete: boolean) =>
      saveConsultation(appointmentId!, {
        vitals,
        diagnosis,
        notes,
        followUpDate: followUpDate || undefined,
        prescriptions,
        labTestsOrdered,
        radiologyOrdered,
        complete,
      }),
    onSuccess: (_, complete) => {
      queryClient.invalidateQueries({ queryKey: ['consultation', appointmentId] });
      if (complete) navigate('/doctor');
    },
  });

  function addLabTest() {
    setLabTestsOrdered((prev) => [...prev, { testName: '' }]);
  }

  function updateLabTest(index: number, field: keyof LabTestOrderInput, value: string) {
    setLabTestsOrdered((prev) => prev.map((o, i) => (i === index ? { ...o, [field]: value } : o)));
  }

  function removeLabTest(index: number) {
    setLabTestsOrdered((prev) => prev.filter((_, i) => i !== index));
  }

  function addRadiologyTest() {
    setRadiologyOrdered((prev) => [...prev, { testName: '' }]);
  }

  function updateRadiologyTest(index: number, field: keyof RadiologyTestOrderInput, value: string) {
    setRadiologyOrdered((prev) => prev.map((o, i) => (i === index ? { ...o, [field]: value } : o)));
  }

  function removeRadiologyTest(index: number) {
    setRadiologyOrdered((prev) => prev.filter((_, i) => i !== index));
  }

  function addPrescription() {
    setPrescriptions((prev) => [...prev, { medicine: '', dosage: '', frequency: '', durationDays: 5 }]);
  }

  function updatePrescription(index: number, field: keyof PrescriptionInput, value: string | number) {
    setPrescriptions((prev) =>
      prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    );
  }

  function removePrescription(index: number) {
    setPrescriptions((prev) => prev.filter((_, i) => i !== index));
  }

  const [dietaryPreference, setDietaryPreference] = useState<DietaryPreference>('VEG');
  const [allergies, setAllergies] = useState('');
  const [localFoodNotes, setLocalFoodNotes] = useState('');
  const [planText, setPlanText] = useState('');
  const [whatsappStatus, setWhatsappStatus] = useState<string | null>(null);

  const dietPlanMutation = useMutation({
    mutationFn: () =>
      createDietPlan({
        patientId: patient!.id,
        consultationId: existing?.id,
        dietaryPreference,
        allergies: allergies || undefined,
        localFoodNotes: localFoodNotes || undefined,
        planText,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['diet-plans', patient?.id] });
      setAllergies('');
      setLocalFoodNotes('');
      setPlanText('');
    },
  });

  const sendDietPlanMutation = useMutation({
    mutationFn: (id: string) => sendDietPlanWhatsApp(id),
    onSuccess: (notification) =>
      setWhatsappStatus(
        notification.status === 'SENT' ? 'Diet plan sent via WhatsApp.' : `Diet plan not sent: ${notification.error}`,
      ),
  });

  const sendPrescriptionMutation = useMutation({
    mutationFn: () => sendPrescriptionWhatsApp(appointmentId!),
    onSuccess: (notification) =>
      setWhatsappStatus(
        notification.status === 'SENT' ? 'Prescription sent via WhatsApp.' : `Prescription not sent: ${notification.error}`,
      ),
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-teal">Consultation</h1>

      <section className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-semibold text-gray-700">Vitals</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(
            [
              ['bpSystolic', 'BP Systolic'],
              ['bpDiastolic', 'BP Diastolic'],
              ['pulse', 'Pulse'],
              ['tempC', 'Temp (°C)'],
              ['weightKg', 'Weight (kg)'],
              ['heightCm', 'Height (cm)'],
              ['spo2', 'SpO2 (%)'],
            ] as [keyof Vitals, string][]
          ).map(([key, label]) => (
            <div key={key}>
              <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
              <input
                type="number"
                value={vitals[key] ?? ''}
                onChange={(e) =>
                  setVitals((v) => ({ ...v, [key]: e.target.value ? Number(e.target.value) : undefined }))
                }
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-teal focus:outline-none"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-semibold text-gray-700">Diagnosis & Notes</h2>
        <input
          value={diagnosis}
          onChange={(e) => setDiagnosis(e.target.value)}
          placeholder="Diagnosis"
          className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-teal focus:outline-none"
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Consultation notes"
          rows={4}
          className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-teal focus:outline-none"
        />
        <label className="mb-1 block text-xs font-medium text-gray-500">Follow-up date (optional)</label>
        <input
          type="date"
          value={followUpDate}
          onChange={(e) => setFollowUpDate(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 focus:border-teal focus:outline-none"
        />
      </section>

      <section className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-gray-700">Prescriptions</h2>
          <button onClick={addPrescription} className="text-sm text-teal hover:underline">
            + Add medicine
          </button>
        </div>
        <div className="space-y-3">
          {prescriptions.map((p, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-md border border-gray-200 p-3 sm:grid-cols-5">
              <div className="sm:col-span-2">
                <SuggestInput
                  placeholder="Medicine"
                  value={p.medicine}
                  onChange={(v) => updatePrescription(i, 'medicine', v)}
                  suggestions={medicineNames}
                  testId={`prescription-medicine-${i}`}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <input
                placeholder="Dosage"
                value={p.dosage}
                onChange={(e) => updatePrescription(i, 'dosage', e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
              <input
                placeholder="Frequency"
                value={p.frequency}
                onChange={(e) => updatePrescription(i, 'frequency', e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  placeholder="Days"
                  value={p.durationDays}
                  onChange={(e) => updatePrescription(i, 'durationDays', Number(e.target.value))}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
                <button onClick={() => removePrescription(i)} className="text-red-400 hover:text-red-600">
                  ×
                </button>
              </div>
            </div>
          ))}
          {prescriptions.length === 0 && <p className="text-sm text-gray-400">No prescriptions added.</p>}
        </div>
        {existing && existing.prescriptions.length > 0 && (
          <div className="mt-3 border-t border-gray-100 pt-3">
            <button
              onClick={() => sendPrescriptionMutation.mutate()}
              disabled={sendPrescriptionMutation.isPending || !patient?.whatsappOptIn}
              className="rounded-md border border-teal px-3 py-1.5 text-sm text-teal hover:bg-teal-light disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send saved prescription via WhatsApp
            </button>
            {!patient?.whatsappOptIn && (
              <p className="mt-1 text-xs text-gray-400">Patient hasn't opted in to WhatsApp messages yet.</p>
            )}
          </div>
        )}
      </section>

      <section className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-gray-700">Prescription Scan</h2>
        {existing?.id ? (
          <AttachmentPanel category="PRESCRIPTION_SCAN" entityId={existing.id} label="Attached scans (e.g. a prescription the patient brought in)" />
        ) : (
          <p className="mt-2 text-sm text-gray-400">Save a draft first to attach a file.</p>
        )}
      </section>

      <section className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-semibold text-gray-700">Diet Plan</h2>
        {patient ? (
          <>
            {dietPlans && dietPlans.length > 0 && (
              <div className="mb-4 space-y-3">
                {dietPlans.map((plan) => (
                  <div key={plan.id} className="rounded-md border border-gray-200 p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        {DIETARY_PREFERENCE_OPTIONS.find((o) => o.value === plan.dietaryPreference)?.label}
                      </span>
                      <span className="text-xs text-gray-400">{new Date(plan.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm text-gray-700">{plan.planText}</p>
                    {plan.allergies && <p className="mt-1 text-xs text-gray-500">Allergies: {plan.allergies}</p>}
                    {plan.localFoodNotes && <p className="text-xs text-gray-500">Local food notes: {plan.localFoodNotes}</p>}
                    <button
                      onClick={() => sendDietPlanMutation.mutate(plan.id)}
                      disabled={sendDietPlanMutation.isPending || !patient.whatsappOptIn}
                      className="mt-2 rounded-md border border-teal px-3 py-1 text-xs text-teal hover:bg-teal-light disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Send via WhatsApp
                    </button>
                  </div>
                ))}
              </div>
            )}
            {!patient.whatsappOptIn && (
              <p className="mb-3 text-xs text-gray-400">Patient hasn't opted in to WhatsApp messages yet.</p>
            )}

            <div className="space-y-3 rounded-md border border-gray-200 p-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Dietary preference</label>
                <select
                  value={dietaryPreference}
                  onChange={(e) => setDietaryPreference(e.target.value as DietaryPreference)}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-teal focus:outline-none"
                >
                  {DIETARY_PREFERENCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <input
                value={allergies}
                onChange={(e) => setAllergies(e.target.value)}
                placeholder="Allergies (optional)"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-teal focus:outline-none"
              />
              <input
                value={localFoodNotes}
                onChange={(e) => setLocalFoodNotes(e.target.value)}
                placeholder="Locally available food notes (optional)"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-teal focus:outline-none"
              />
              <textarea
                value={planText}
                onChange={(e) => setPlanText(e.target.value)}
                placeholder="Diet plan / recommendation, informed by the patient's history, complaints and the fields above"
                rows={3}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-teal focus:outline-none"
              />
              <button
                onClick={() => dietPlanMutation.mutate()}
                disabled={dietPlanMutation.isPending || !planText.trim()}
                className="rounded-md bg-teal px-3 py-1.5 text-sm text-white hover:bg-teal-mid disabled:opacity-60"
              >
                Save diet plan
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400">Loading patient…</p>
        )}
        {whatsappStatus && <p className="mt-3 text-sm text-teal">{whatsappStatus}</p>}
      </section>

      {clinic && clinic.tier >= 2 && (
        <section className="mb-6 rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-gray-700">Lab Tests Ordered</h2>
            <button onClick={addLabTest} className="text-sm text-teal hover:underline">
              + Add test
            </button>
          </div>
          <div className="space-y-3">
            {labTestsOrdered.map((o, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-md border border-gray-200 p-3 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <SuggestInput
                    placeholder="Test name"
                    value={o.testName}
                    onChange={(v) => updateLabTest(i, 'testName', v)}
                    suggestions={labTestNames}
                    testId={`lab-test-name-${i}`}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <input
                  placeholder="Notes (optional)"
                  value={o.notes ?? ''}
                  onChange={(e) => updateLabTest(i, 'notes', e.target.value)}
                  className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
                <button onClick={() => removeLabTest(i)} className="text-red-400 hover:text-red-600">
                  Remove
                </button>
              </div>
            ))}
            {labTestsOrdered.length === 0 && <p className="text-sm text-gray-400">No lab tests ordered.</p>}
          </div>
        </section>
      )}

      {clinic && clinic.tier >= 2 && (
        <section className="mb-6 rounded-xl bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-gray-700">Radiology Ordered</h2>
            <button onClick={addRadiologyTest} className="text-sm text-teal hover:underline">
              + Add test
            </button>
          </div>
          <div className="space-y-3">
            {radiologyOrdered.map((o, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-md border border-gray-200 p-3 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <SuggestInput
                    placeholder="Test name (e.g. Chest X-Ray)"
                    value={o.testName}
                    onChange={(v) => updateRadiologyTest(i, 'testName', v)}
                    suggestions={radiologyTestNames}
                    testId={`radiology-test-name-${i}`}
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <input
                  placeholder="Notes (optional)"
                  value={o.notes ?? ''}
                  onChange={(e) => updateRadiologyTest(i, 'notes', e.target.value)}
                  className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
                <button onClick={() => removeRadiologyTest(i)} className="text-red-400 hover:text-red-600">
                  Remove
                </button>
              </div>
            ))}
            {radiologyOrdered.length === 0 && <p className="text-sm text-gray-400">No radiology ordered.</p>}
          </div>
        </section>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => saveMutation.mutate(false)}
          disabled={saveMutation.isPending}
          className="flex-1 rounded-md border border-teal py-2 font-medium text-teal hover:bg-teal-light disabled:opacity-60"
        >
          Save draft
        </button>
        <button
          onClick={() => saveMutation.mutate(true)}
          disabled={saveMutation.isPending}
          className="flex-1 rounded-md bg-teal py-2 font-medium text-white hover:bg-teal-mid disabled:opacity-60"
        >
          Complete consultation
        </button>
      </div>
    </div>
  );
}
