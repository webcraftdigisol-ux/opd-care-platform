import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getConsultation, saveConsultation } from '../api/consultations';
import type { PrescriptionInput, Vitals } from '@opd/shared';

export function ConsultationPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const navigate = useNavigate();

  const { data: existing } = useQuery({
    queryKey: ['consultation', appointmentId],
    queryFn: () => getConsultation(appointmentId!),
    enabled: !!appointmentId,
  });

  const [vitals, setVitals] = useState<Vitals>({});
  const [diagnosis, setDiagnosis] = useState('');
  const [notes, setNotes] = useState('');
  const [prescriptions, setPrescriptions] = useState<PrescriptionInput[]>([]);

  useEffect(() => {
    if (existing) {
      setVitals(existing.vitals ?? {});
      setDiagnosis(existing.diagnosis ?? '');
      setNotes(existing.notes ?? '');
      setPrescriptions(
        existing.prescriptions.map((p) => ({
          medicine: p.medicine,
          dosage: p.dosage,
          frequency: p.frequency,
          durationDays: p.durationDays,
          notes: p.notes ?? undefined,
        })),
      );
    }
  }, [existing]);

  const saveMutation = useMutation({
    mutationFn: (complete: boolean) =>
      saveConsultation(appointmentId!, { vitals, diagnosis, notes, prescriptions, complete }),
    onSuccess: (_, complete) => {
      if (complete) navigate('/doctor');
    },
  });

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
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-teal focus:outline-none"
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
              <input
                placeholder="Medicine"
                value={p.medicine}
                onChange={(e) => updatePrescription(i, 'medicine', e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm sm:col-span-2"
              />
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
      </section>

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
