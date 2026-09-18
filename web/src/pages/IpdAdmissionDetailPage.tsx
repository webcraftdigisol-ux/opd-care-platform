import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addCharge,
  addDoctorVisit,
  addMedication,
  addProcedure,
  addVitals,
  dischargePatient,
  getAdmission,
  getBillPreview,
  listVacantBeds,
  transferRoom,
} from '../api/ipd';
import { listDoctors } from '../api/doctors';
import { createPharmacySale } from '../api/pharmacy';
import { createLabInvoice } from '../api/lab';
import { createRadiologyInvoice } from '../api/radiology';
import { VitalsTrendChart } from '../components/VitalsTrendChart';
import { useAuth } from '../context/AuthContext';
import type { MedicationSource } from '@opd/shared';

function AmountLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span>₹{value.toFixed(2)}</span>
    </div>
  );
}

export function IpdAdmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Admission, discharge, billing, and non-nursing clinical entries (doctor
  // visits, procedures, ad-hoc/pharmacy/lab/radiology charges) stay with
  // Admin/Doctor. Head Nurse additionally manages bed transfers and can see
  // billing read-only. Nurse gets ward-floor logging (vitals, medications)
  // without any financial visibility.
  const canManageClinical = user?.role === 'ADMIN' || user?.role === 'DOCTOR';
  const canManageBeds = canManageClinical || user?.role === 'HEAD_NURSE';
  const canDoNursing = canManageClinical || user?.role === 'NURSE' || user?.role === 'HEAD_NURSE';
  const canViewBilling = canManageClinical || user?.role === 'HEAD_NURSE';

  const { data: admission, isLoading } = useQuery({
    queryKey: ['ipd-admission', id],
    queryFn: () => getAdmission(id!),
    enabled: !!id,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['ipd-admission', id] });

  // --- Transfer ---
  const [showTransfer, setShowTransfer] = useState(false);
  const { data: vacantBeds } = useQuery({ queryKey: ['ipd-vacant-beds'], queryFn: listVacantBeds, enabled: showTransfer });
  const [toBedId, setToBedId] = useState('');
  const transferMutation = useMutation({
    mutationFn: () => transferRoom(id!, { toBedId }),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['ipd-vacant-beds'] });
      setShowTransfer(false);
      setToBedId('');
    },
  });

  // --- Doctor visits ---
  const { data: doctors } = useQuery({ queryKey: ['doctors'], queryFn: listDoctors });
  const [visitForm, setVisitForm] = useState({ doctorId: '', notes: '', fee: '0' });
  const visitMutation = useMutation({
    mutationFn: () =>
      addDoctorVisit(id!, { doctorId: visitForm.doctorId, notes: visitForm.notes || undefined, fee: Number(visitForm.fee) || 0 }),
    onSuccess: () => {
      invalidate();
      setVisitForm({ doctorId: '', notes: '', fee: '0' });
    },
  });

  // --- Procedures ---
  const [procedureForm, setProcedureForm] = useState({ name: '', notes: '', consentSigned: false, fee: '0' });
  const procedureMutation = useMutation({
    mutationFn: () =>
      addProcedure(id!, {
        name: procedureForm.name,
        notes: procedureForm.notes || undefined,
        consentSigned: procedureForm.consentSigned,
        fee: Number(procedureForm.fee) || 0,
      }),
    onSuccess: () => {
      invalidate();
      setProcedureForm({ name: '', notes: '', consentSigned: false, fee: '0' });
    },
  });

  // --- Medications ---
  const [medForm, setMedForm] = useState({
    medicine: '',
    dosage: '',
    quantity: '1',
    unitPrice: '0',
    source: 'CLINIC_SUPPLIED' as MedicationSource,
  });
  const medMutation = useMutation({
    mutationFn: () =>
      addMedication(id!, {
        medicine: medForm.medicine,
        dosage: medForm.dosage,
        quantity: Number(medForm.quantity) || 1,
        unitPrice: Number(medForm.unitPrice) || 0,
        source: medForm.source,
      }),
    onSuccess: () => {
      invalidate();
      setMedForm({ medicine: '', dosage: '', quantity: '1', unitPrice: '0', source: 'CLINIC_SUPPLIED' });
    },
  });

  // --- Vitals ---
  const [vitalsForm, setVitalsForm] = useState({ pulse: '', bpSystolic: '', bpDiastolic: '', tempC: '', spo2: '' });
  const vitalsMutation = useMutation({
    mutationFn: () =>
      addVitals(id!, {
        pulse: vitalsForm.pulse ? Number(vitalsForm.pulse) : undefined,
        bpSystolic: vitalsForm.bpSystolic ? Number(vitalsForm.bpSystolic) : undefined,
        bpDiastolic: vitalsForm.bpDiastolic ? Number(vitalsForm.bpDiastolic) : undefined,
        tempC: vitalsForm.tempC ? Number(vitalsForm.tempC) : undefined,
        spo2: vitalsForm.spo2 ? Number(vitalsForm.spo2) : undefined,
      }),
    onSuccess: () => {
      invalidate();
      setVitalsForm({ pulse: '', bpSystolic: '', bpDiastolic: '', tempC: '', spo2: '' });
    },
  });

  // --- Ad-hoc charges ---
  const [chargeForm, setChargeForm] = useState({ description: '', amount: '' });
  const chargeMutation = useMutation({
    mutationFn: () => addCharge(id!, { description: chargeForm.description, amount: Number(chargeForm.amount) }),
    onSuccess: () => {
      invalidate();
      setChargeForm({ description: '', amount: '' });
    },
  });

  // --- Quick pharmacy/lab charge ---
  const [pharmForm, setPharmForm] = useState({ medicine: '', quantity: '1', unitPrice: '0' });
  const pharmMutation = useMutation({
    mutationFn: () =>
      createPharmacySale({
        patientId: admission!.patientId,
        admissionId: id,
        items: [
          {
            medicineName: pharmForm.medicine,
            quantity: Number(pharmForm.quantity) || 1,
            unitPrice: Number(pharmForm.unitPrice) || 0,
          },
        ],
      }),
    onSuccess: () => {
      invalidate();
      setPharmForm({ medicine: '', quantity: '1', unitPrice: '0' });
    },
  });

  const [labForm, setLabForm] = useState({ testName: '', resultText: '', price: '0' });
  const labMutation = useMutation({
    mutationFn: () =>
      createLabInvoice({
        patientId: admission!.patientId,
        admissionId: id,
        items: [{ testName: labForm.testName, resultText: labForm.resultText || undefined, price: Number(labForm.price) || 0 }],
      }),
    onSuccess: () => {
      invalidate();
      setLabForm({ testName: '', resultText: '', price: '0' });
    },
  });

  const [radiologyForm, setRadiologyForm] = useState({ testName: '', resultText: '', price: '0' });
  const radiologyMutation = useMutation({
    mutationFn: () =>
      createRadiologyInvoice({
        patientId: admission!.patientId,
        admissionId: id,
        items: [
          {
            testName: radiologyForm.testName,
            resultText: radiologyForm.resultText || undefined,
            price: Number(radiologyForm.price) || 0,
          },
        ],
      }),
    onSuccess: () => {
      invalidate();
      setRadiologyForm({ testName: '', resultText: '', price: '0' });
    },
  });

  // --- Discharge ---
  const [showDischarge, setShowDischarge] = useState(false);
  const { data: billPreview } = useQuery({
    queryKey: ['ipd-bill-preview', id],
    queryFn: () => getBillPreview(id!),
    enabled: showDischarge && admission?.status === 'ADMITTED' && canViewBilling,
  });
  const [dischargeSummary, setDischargeSummary] = useState('');
  const dischargeMutation = useMutation({
    mutationFn: () => dischargePatient(id!, { dischargeSummary: dischargeSummary || undefined }),
    onSuccess: () => {
      invalidate();
      setShowDischarge(false);
    },
  });

  if (isLoading || !admission) return <div className="px-4 py-8 text-gray-500">Loading…</div>;

  const isAdmitted = admission.status === 'ADMITTED';

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-teal">{admission.patient?.name}</h1>
            <p className="text-sm text-gray-500">
              {admission.wardName} · {admission.bedLabel} · Admitting doctor: Dr. {admission.admittingDoctorName}
            </p>
            <p className="text-sm text-gray-500">Admitted {new Date(admission.admittedAt).toLocaleString()}</p>
            {admission.reason && <p className="mt-1 text-sm">{admission.reason}</p>}
          </div>
          <div className="flex gap-2">
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                isAdmitted ? 'border-teal-mid bg-teal-light text-teal' : 'border-gray-300 bg-gray-100 text-gray-500'
              }`}
            >
              {admission.status}
            </span>
          </div>
        </div>
        {isAdmitted && (canManageBeds || canManageClinical) && (
          <div className="mt-4 flex gap-2">
            {canManageBeds && (
              <button
                onClick={() => setShowTransfer((v) => !v)}
                className="rounded-md border border-teal px-3 py-1.5 text-sm text-teal hover:bg-teal-light"
              >
                Transfer Room
              </button>
            )}
            {canManageClinical && (
              <button
                onClick={() => setShowDischarge((v) => !v)}
                className="rounded-md bg-teal px-3 py-1.5 text-sm text-white hover:bg-teal-mid"
              >
                Discharge
              </button>
            )}
          </div>
        )}
        {showTransfer && canManageBeds && (
          <div className="mt-3 flex gap-2 rounded-md bg-gray-50 p-3">
            <select value={toBedId} onChange={(e) => setToBedId(e.target.value)} className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm">
              <option value="">Select a vacant bed</option>
              {vacantBeds?.map((bed) => (
                <option key={bed.id} value={bed.id}>
                  {bed.wardName} — {bed.label} (₹{bed.dailyRate}/day)
                </option>
              ))}
            </select>
            <button
              onClick={() => transferMutation.mutate()}
              disabled={!toBedId || transferMutation.isPending}
              className="rounded-md bg-teal px-3 py-1.5 text-sm text-white hover:bg-teal-mid disabled:opacity-60"
            >
              Confirm
            </button>
          </div>
        )}
      </div>

      {showDischarge && isAdmitted && (
        <div className="mb-6 rounded-xl border-2 border-teal bg-white p-6 shadow-sm">
          <h2 className="mb-3 font-semibold text-teal">Discharge & Final Bill</h2>
          {billPreview ? (
            <div className="space-y-1">
              <AmountLine label="Room charges" value={billPreview.roomCharges} />
              <AmountLine label="Doctor visits" value={billPreview.doctorVisitCharges} />
              <AmountLine label="Procedures" value={billPreview.procedureCharges} />
              <AmountLine label="Medications (clinic-supplied)" value={billPreview.medicationCharges} />
              <AmountLine label="Other charges" value={billPreview.adHocCharges} />
              <AmountLine label="Pharmacy" value={billPreview.pharmacyCharges} />
              <AmountLine label="Lab" value={billPreview.labCharges} />
              <AmountLine label="Radiology" value={billPreview.radiologyCharges} />
              <hr className="my-2" />
              <AmountLine label="Subtotal" value={billPreview.subtotal} />
              <AmountLine label={`Tax (${billPreview.taxPercent}%)`} value={billPreview.taxAmount} />
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span>₹{billPreview.total.toFixed(2)}</span>
              </div>
              <AmountLine label="Deposit collected" value={-billPreview.depositAmount} />
              <div
                className={`mt-2 flex justify-between rounded-md p-3 text-lg font-bold ${
                  billPreview.amountDue >= 0 ? 'bg-gold-light text-gold' : 'bg-teal-light text-teal'
                }`}
              >
                <span>{billPreview.amountDue >= 0 ? 'Amount Due' : 'Refund Owed'}</span>
                <span>₹{Math.abs(billPreview.amountDue).toFixed(2)}</span>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">Calculating bill…</p>
          )}
          <textarea
            value={dischargeSummary}
            onChange={(e) => setDischargeSummary(e.target.value)}
            placeholder="Discharge summary (optional)"
            rows={3}
            className="mt-4 w-full rounded-md border border-gray-300 px-3 py-2"
          />
          <button
            onClick={() => dischargeMutation.mutate()}
            disabled={dischargeMutation.isPending}
            className="mt-3 w-full rounded-md bg-teal py-2 font-medium text-white hover:bg-teal-mid disabled:opacity-60"
          >
            {dischargeMutation.isPending ? 'Finalizing…' : 'Confirm Discharge'}
          </button>
        </div>
      )}

      {admission.bill && canViewBilling && (
        <div className="mb-6 rounded-xl border-2 border-teal bg-white p-6 shadow-sm">
          <h2 className="mb-3 font-semibold text-teal">Final Bill</h2>
          <div className="space-y-1">
            <AmountLine label="Room charges" value={admission.bill.roomCharges} />
            <AmountLine label="Doctor visits" value={admission.bill.doctorVisitCharges} />
            <AmountLine label="Procedures" value={admission.bill.procedureCharges} />
            <AmountLine label="Medications (clinic-supplied)" value={admission.bill.medicationCharges} />
            <AmountLine label="Other charges" value={admission.bill.adHocCharges} />
            <AmountLine label="Pharmacy" value={admission.bill.pharmacyCharges} />
            <AmountLine label="Lab" value={admission.bill.labCharges} />
            <AmountLine label="Radiology" value={admission.bill.radiologyCharges} />
            <hr className="my-2" />
            <AmountLine label="Subtotal" value={admission.bill.subtotal} />
            <AmountLine label={`Tax (${admission.bill.taxPercent}%)`} value={admission.bill.taxAmount} />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>₹{admission.bill.total.toFixed(2)}</span>
            </div>
            <AmountLine label="Deposit collected" value={-admission.bill.depositAmount} />
            <div
              className={`mt-2 flex justify-between rounded-md p-3 text-lg font-bold ${
                admission.bill.amountDue >= 0 ? 'bg-gold-light text-gold' : 'bg-teal-light text-teal'
              }`}
            >
              <span>{admission.bill.amountDue >= 0 ? 'Amount Due' : 'Refund Owed'}</span>
              <span>₹{Math.abs(admission.bill.amountDue).toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {admission.vitalsLogs.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <VitalsTrendChart
            label="Pulse"
            unit=" bpm"
            points={admission.vitalsLogs.filter((v) => v.pulse != null).map((v) => ({ x: v.recordedAt, y: v.pulse! }))}
          />
          <VitalsTrendChart
            label="Temperature"
            unit="°C"
            points={admission.vitalsLogs.filter((v) => v.tempC != null).map((v) => ({ x: v.recordedAt, y: v.tempC! }))}
          />
        </div>
      )}

      <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-semibold text-gray-700">Vitals</h2>
        <div className="mb-3 space-y-1">
          {admission.vitalsLogs.map((v) => (
            <p key={v.id} className="text-sm text-gray-600">
              {new Date(v.recordedAt).toLocaleString()} — Pulse {v.pulse ?? '—'}, BP {v.bpSystolic ?? '—'}/{v.bpDiastolic ?? '—'},
              Temp {v.tempC ?? '—'}°C, SpO2 {v.spo2 ?? '—'}% ({v.recordedByName})
            </p>
          ))}
          {admission.vitalsLogs.length === 0 && <p className="text-sm text-gray-400">No vitals recorded yet.</p>}
        </div>
        {isAdmitted && canDoNursing && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <input placeholder="Pulse" type="number" value={vitalsForm.pulse} onChange={(e) => setVitalsForm((f) => ({ ...f, pulse: e.target.value }))} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
            <input placeholder="BP Sys" type="number" value={vitalsForm.bpSystolic} onChange={(e) => setVitalsForm((f) => ({ ...f, bpSystolic: e.target.value }))} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
            <input placeholder="BP Dia" type="number" value={vitalsForm.bpDiastolic} onChange={(e) => setVitalsForm((f) => ({ ...f, bpDiastolic: e.target.value }))} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
            <input placeholder="Temp °C" type="number" value={vitalsForm.tempC} onChange={(e) => setVitalsForm((f) => ({ ...f, tempC: e.target.value }))} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
            <div className="flex gap-1">
              <input placeholder="SpO2" type="number" value={vitalsForm.spo2} onChange={(e) => setVitalsForm((f) => ({ ...f, spo2: e.target.value }))} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
              <button onClick={() => vitalsMutation.mutate()} className="rounded-md bg-teal px-2 text-sm text-white">
                +
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-semibold text-gray-700">Doctor Visits</h2>
        <div className="mb-3 space-y-1">
          {admission.doctorVisits.map((v) => (
            <p key={v.id} className="text-sm text-gray-600">
              {new Date(v.visitedAt).toLocaleString()} — Dr. {v.doctorName} {v.notes && `· ${v.notes}`} — ₹{v.fee.toFixed(2)}
            </p>
          ))}
          {admission.doctorVisits.length === 0 && <p className="text-sm text-gray-400">No visits logged yet.</p>}
        </div>
        {isAdmitted && canManageClinical && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <select value={visitForm.doctorId} onChange={(e) => setVisitForm((f) => ({ ...f, doctorId: e.target.value }))} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm sm:col-span-2">
              <option value="">Doctor</option>
              {doctors?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.user.name}
                </option>
              ))}
            </select>
            <input placeholder="Notes" value={visitForm.notes} onChange={(e) => setVisitForm((f) => ({ ...f, notes: e.target.value }))} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
            <div className="flex gap-1">
              <input placeholder="Fee" type="number" value={visitForm.fee} onChange={(e) => setVisitForm((f) => ({ ...f, fee: e.target.value }))} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
              <button onClick={() => visitMutation.mutate()} disabled={!visitForm.doctorId} className="rounded-md bg-teal px-2 text-sm text-white disabled:opacity-60">
                +
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-semibold text-gray-700">Procedures</h2>
        <div className="mb-3 space-y-1">
          {admission.procedures.map((p) => (
            <p key={p.id} className="text-sm text-gray-600">
              {new Date(p.performedAt).toLocaleString()} — {p.name} {p.consentSigned ? '(consent signed)' : '(no consent on file)'} — ₹
              {p.fee.toFixed(2)}
            </p>
          ))}
          {admission.procedures.length === 0 && <p className="text-sm text-gray-400">No procedures logged yet.</p>}
        </div>
        {isAdmitted && canManageClinical && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <input placeholder="Procedure name" value={procedureForm.name} onChange={(e) => setProcedureForm((f) => ({ ...f, name: e.target.value }))} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm sm:col-span-2" />
            <input placeholder="Notes" value={procedureForm.notes} onChange={(e) => setProcedureForm((f) => ({ ...f, notes: e.target.value }))} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
            <input placeholder="Fee" type="number" value={procedureForm.fee} onChange={(e) => setProcedureForm((f) => ({ ...f, fee: e.target.value }))} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
            <div className="flex items-center gap-1">
              <label className="flex items-center gap-1 text-xs text-gray-500">
                <input type="checkbox" checked={procedureForm.consentSigned} onChange={(e) => setProcedureForm((f) => ({ ...f, consentSigned: e.target.checked }))} />
                Consent
              </label>
              <button onClick={() => procedureMutation.mutate()} disabled={!procedureForm.name} className="rounded-md bg-teal px-2 text-sm text-white disabled:opacity-60">
                +
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-semibold text-gray-700">Medications Given</h2>
        <div className="mb-3 space-y-1">
          {admission.medications.map((m) => (
            <p key={m.id} className="text-sm text-gray-600">
              {new Date(m.givenAt).toLocaleString()} — {m.medicine} ({m.dosage}) × {m.quantity} —{' '}
              {m.source === 'CLINIC_SUPPLIED' ? `₹${(m.quantity * m.unitPrice).toFixed(2)} (clinic-supplied)` : 'patient-supplied, not billed'}
            </p>
          ))}
          {admission.medications.length === 0 && <p className="text-sm text-gray-400">None logged yet.</p>}
        </div>
        {isAdmitted && canDoNursing && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
            <input placeholder="Medicine" value={medForm.medicine} onChange={(e) => setMedForm((f) => ({ ...f, medicine: e.target.value }))} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm sm:col-span-2" />
            <input placeholder="Dosage" value={medForm.dosage} onChange={(e) => setMedForm((f) => ({ ...f, dosage: e.target.value }))} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
            <input placeholder="Qty" type="number" value={medForm.quantity} onChange={(e) => setMedForm((f) => ({ ...f, quantity: e.target.value }))} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
            <select value={medForm.source} onChange={(e) => setMedForm((f) => ({ ...f, source: e.target.value as MedicationSource }))} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
              <option value="CLINIC_SUPPLIED">Clinic-supplied</option>
              <option value="PATIENT_OWN">Patient's own</option>
            </select>
            <div className="flex gap-1">
              {medForm.source === 'CLINIC_SUPPLIED' && (
                <input placeholder="Unit ₹" type="number" value={medForm.unitPrice} onChange={(e) => setMedForm((f) => ({ ...f, unitPrice: e.target.value }))} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
              )}
              <button onClick={() => medMutation.mutate()} disabled={!medForm.medicine || !medForm.dosage} className="rounded-md bg-teal px-2 text-sm text-white disabled:opacity-60">
                +
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-semibold text-gray-700">Other Charges</h2>
        <div className="mb-3 space-y-1">
          {admission.charges.map((c) => (
            <p key={c.id} className="text-sm text-gray-600">
              {new Date(c.chargedAt).toLocaleString()} — {c.description} — ₹{c.amount.toFixed(2)}
            </p>
          ))}
          {admission.charges.length === 0 && <p className="text-sm text-gray-400">None yet.</p>}
        </div>
        {isAdmitted && canManageClinical && (
          <div className="flex gap-2">
            <input placeholder="Description (e.g. Oxygen, Nursing care)" value={chargeForm.description} onChange={(e) => setChargeForm((f) => ({ ...f, description: e.target.value }))} className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
            <input placeholder="Amount" type="number" value={chargeForm.amount} onChange={(e) => setChargeForm((f) => ({ ...f, amount: e.target.value }))} className="w-28 rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
            <button onClick={() => chargeMutation.mutate()} disabled={!chargeForm.description || !chargeForm.amount} className="rounded-md bg-teal px-3 text-sm text-white disabled:opacity-60">
              Add
            </button>
          </div>
        )}
      </div>

      <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-semibold text-gray-700">Pharmacy (In-Patient)</h2>
        <div className="mb-3 space-y-1">
          {admission.pharmacySales.map((s) => (
            <p key={s.id} className="text-sm text-gray-600">
              {new Date(s.createdAt).toLocaleString()} — {s.items.map((i) => i.medicineName).join(', ')} — ₹{s.total.toFixed(2)}
            </p>
          ))}
          {admission.pharmacySales.length === 0 && <p className="text-sm text-gray-400">None yet.</p>}
        </div>
        {isAdmitted && canManageClinical && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input placeholder="Medicine" value={pharmForm.medicine} onChange={(e) => setPharmForm((f) => ({ ...f, medicine: e.target.value }))} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm sm:col-span-2" />
            <input placeholder="Qty" type="number" value={pharmForm.quantity} onChange={(e) => setPharmForm((f) => ({ ...f, quantity: e.target.value }))} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
            <div className="flex gap-1">
              <input placeholder="Unit ₹" type="number" value={pharmForm.unitPrice} onChange={(e) => setPharmForm((f) => ({ ...f, unitPrice: e.target.value }))} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
              <button onClick={() => pharmMutation.mutate()} disabled={!pharmForm.medicine} className="rounded-md bg-teal px-2 text-sm text-white disabled:opacity-60">
                +
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-semibold text-gray-700">Lab (In-Patient)</h2>
        <div className="mb-3 space-y-1">
          {admission.labInvoices.map((inv) => (
            <p key={inv.id} className="text-sm text-gray-600">
              {new Date(inv.createdAt).toLocaleString()} — {inv.items.map((i) => i.testName).join(', ')} — ₹{inv.total.toFixed(2)}
            </p>
          ))}
          {admission.labInvoices.length === 0 && <p className="text-sm text-gray-400">None yet.</p>}
        </div>
        {isAdmitted && canManageClinical && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input placeholder="Test name" value={labForm.testName} onChange={(e) => setLabForm((f) => ({ ...f, testName: e.target.value }))} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm sm:col-span-2" />
            <input placeholder="Result" value={labForm.resultText} onChange={(e) => setLabForm((f) => ({ ...f, resultText: e.target.value }))} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
            <div className="flex gap-1">
              <input placeholder="Price" type="number" value={labForm.price} onChange={(e) => setLabForm((f) => ({ ...f, price: e.target.value }))} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
              <button onClick={() => labMutation.mutate()} disabled={!labForm.testName} className="rounded-md bg-teal px-2 text-sm text-white disabled:opacity-60">
                +
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-semibold text-gray-700">Radiology (In-Patient)</h2>
        <div className="mb-3 space-y-1">
          {admission.radiologyInvoices.map((inv) => (
            <p key={inv.id} className="text-sm text-gray-600">
              {new Date(inv.createdAt).toLocaleString()} — {inv.items.map((i) => i.testName).join(', ')} — ₹{inv.total.toFixed(2)}
            </p>
          ))}
          {admission.radiologyInvoices.length === 0 && <p className="text-sm text-gray-400">None yet.</p>}
        </div>
        {isAdmitted && canManageClinical && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <input placeholder="Test name (e.g. Chest X-Ray)" value={radiologyForm.testName} onChange={(e) => setRadiologyForm((f) => ({ ...f, testName: e.target.value }))} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm sm:col-span-2" />
            <input placeholder="Result" value={radiologyForm.resultText} onChange={(e) => setRadiologyForm((f) => ({ ...f, resultText: e.target.value }))} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
            <div className="flex gap-1">
              <input placeholder="Price" type="number" value={radiologyForm.price} onChange={(e) => setRadiologyForm((f) => ({ ...f, price: e.target.value }))} className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
              <button onClick={() => radiologyMutation.mutate()} disabled={!radiologyForm.testName} className="rounded-md bg-teal px-2 text-sm text-white disabled:opacity-60">
                +
              </button>
            </div>
          </div>
        )}
      </div>

      {admission.roomTransfers.length > 0 && (
        <div className="mb-6 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-3 font-semibold text-gray-700">Room Transfer History</h2>
          <div className="space-y-1">
            {admission.roomTransfers.map((t) => (
              <p key={t.id} className="text-sm text-gray-600">
                {new Date(t.transferredAt).toLocaleString()} — {t.fromBedLabel ?? 'Initial'} → {t.toBedLabel}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
