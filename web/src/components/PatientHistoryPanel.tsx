import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPatientRecords } from '../api/patients';
import { openAttachment } from '../api/attachments';
import { DicomViewer } from './DicomViewer';
import { VitalsTrendChart } from './VitalsTrendChart';
import { previousVisits, vitalsSeries } from '../utils/patientHistory';
import { medicineLabel, vitalChips, whenToTake } from '../utils/visitFormat';
import type { Attachment } from '@opd/shared';

const ATTACHMENT_CATEGORY_LABEL: Record<string, string> = {
  LAB_REPORT: 'Lab report',
  RADIOLOGY_REPORT: 'Radiology report',
  PRESCRIPTION_SCAN: 'Prescription scan',
  RADIOLOGY_DICOM: 'DICOM image',
  PATIENT_REPORT: 'Report',
  PATIENT_IMAGE: 'Image',
  CONSENT_FORM: 'Signed consent form',
};

const TREND_VITALS = [
  { key: 'bpSystolic', label: 'BP Systolic', unit: '' },
  { key: 'pulse', label: 'Pulse', unit: ' bpm' },
  { key: 'weightKg', label: 'Weight', unit: ' kg' },
  { key: 'spo2', label: 'SpO2', unit: '%' },
] as const;

// The doctor's read-only view of everything already on file for this
// patient, shown above the consultation form: earlier visits (diagnosis,
// vitals, prescriptions, orders), vitals trends across them, lab/radiology
// results, and uploaded reports. Reuses GET /patients/:id/records -- the
// same payload the patient's own My Records page reads.
export function PatientHistoryPanel({
  patientId,
  currentAppointmentId,
  currentConsultationId,
}: {
  patientId: string;
  currentAppointmentId: string;
  currentConsultationId?: string;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['patient-records', patientId],
    queryFn: () => getPatientRecords(patientId),
  });
  const [viewingDicom, setViewingDicom] = useState<Attachment | null>(null);

  if (isLoading) {
    return (
      <section className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-500">Loading patient history…</p>
      </section>
    );
  }
  if (isError || !data) {
    return (
      <section className="mb-6 rounded-xl bg-white p-6 shadow-sm">
        <p className="text-sm text-red-600">Couldn't load patient history.</p>
      </section>
    );
  }

  const visits = previousVisits(data.appointments, currentAppointmentId);
  const trends = TREND_VITALS.map((t) => ({ ...t, points: vitalsSeries(visits, t.key) })).filter(
    (t) => t.points.length >= 2,
  );
  const results = [
    ...data.labInvoices.flatMap((inv) =>
      inv.items.filter((i) => i.resultText).map((i) => ({ ...i, kind: 'Lab', createdAt: inv.createdAt })),
    ),
    ...data.radiologyInvoices.flatMap((inv) =>
      inv.items.filter((i) => i.resultText).map((i) => ({ ...i, kind: 'Radiology', createdAt: inv.createdAt })),
    ),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // The current visit's own uploads already show in its Prescription Scan section.
  const files = data.attachments.filter((a) => a.entityId !== currentConsultationId);

  const isFirstVisit = visits.length === 0 && results.length === 0 && files.length === 0;

  return (
    <section className="mb-6 rounded-xl bg-white p-6 shadow-sm" data-testid="patient-history">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-gray-700">Patient History</h2>
        <p className="text-sm text-gray-500">
          {data.patient.name}
          {data.patient.phone ? ` · ${data.patient.phone}` : ''}
        </p>
      </div>

      {isFirstVisit && <p className="text-sm text-gray-500">First visit — no earlier records on file.</p>}

      {trends.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          {trends.map((t) => (
            <VitalsTrendChart key={t.key} label={t.label} unit={t.unit} points={t.points} />
          ))}
        </div>
      )}

      {visits.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Previous visits ({visits.length})
          </h3>
          <div className="space-y-2">
            {visits.map((v, i) => {
              const c = v.consultation;
              const vitalsSummary = vitalChips(c.vitals);
              return (
                <details
                  key={v.id}
                  open={i === 0}
                  className="rounded-md border border-gray-200 p-3"
                  data-testid="history-visit"
                >
                  <summary className="cursor-pointer text-sm">
                    <span className="font-medium">{v.date}</span>
                    <span className="text-gray-500"> · {v.doctor?.user.name ?? 'Doctor'}</span>
                    {c.diagnosis && <span className="text-gray-700"> · {c.diagnosis}</span>}
                  </summary>
                  <div className="mt-2 space-y-1 text-sm text-gray-600">
                    {vitalsSummary.length > 0 && <p>{vitalsSummary.join(' · ')}</p>}
                    {c.chiefComplaint && <p>Complaint: {c.chiefComplaint}</p>}
                    {c.notes && <p>Advice: {c.notes}</p>}
                    {c.prescriptions.length > 0 && (
                      <div>
                        <p className="font-medium text-gray-700">Prescribed</p>
                        <ul className="ml-4 list-disc">
                          {c.prescriptions.map((p) => (
                            <li key={p.id}>
                              {medicineLabel(p)} — {whenToTake(p)}, {p.durationDays} days
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {c.labTestsOrdered.length > 0 && (
                      <p>
                        <span className="font-medium text-gray-700">Lab ordered: </span>
                        {c.labTestsOrdered.map((o) => o.testName).join(', ')}
                      </p>
                    )}
                    {c.radiologyOrdered.length > 0 && (
                      <p>
                        <span className="font-medium text-gray-700">Radiology ordered: </span>
                        {c.radiologyOrdered.map((o) => o.testName).join(', ')}
                      </p>
                    )}
                    {c.followUpDate && <p className="text-xs text-gray-500">Follow-up: {c.followUpDate.slice(0, 10)}</p>}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Lab & radiology results</h3>
          <ul className="space-y-1 text-sm text-gray-600">
            {results.map((r) => (
              <li key={r.id}>
                <span className="text-gray-400">{new Date(r.createdAt).toLocaleDateString()} · {r.kind} · </span>
                <span className="font-medium text-gray-700">{r.testName}:</span> {r.resultText}
              </li>
            ))}
          </ul>
        </div>
      )}

      {files.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Reports & files</h3>
          <div className="space-y-2">
            {files.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => (a.category === 'RADIOLOGY_DICOM' ? setViewingDicom(a) : openAttachment(a))}
                className="flex w-full items-center justify-between rounded-md border border-gray-200 p-3 text-left hover:border-teal"
              >
                <div>
                  <p className="text-sm font-medium text-teal">{a.fileName}</p>
                  <p className="text-xs text-gray-500">
                    {ATTACHMENT_CATEGORY_LABEL[a.category] ?? a.category} · {new Date(a.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-xs text-gray-400">{(a.sizeBytes / 1024).toFixed(0)} KB</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {viewingDicom && <DicomViewer attachment={viewingDicom} onClose={() => setViewingDicom(null)} />}
    </section>
  );
}
