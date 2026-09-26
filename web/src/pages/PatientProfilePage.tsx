import { useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Attachment, Patient, PatientRecordsResponse } from '@opd/shared';
import { getPatient, getPatientBilling, getPatientRecords } from '../api/patients';
import { openAttachment, uploadAttachment } from '../api/attachments';
import { useAuth } from '../context/AuthContext';
import { Card, Detail, EmptyState, btnPrimary, btnSecondary } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';
import { initials } from '../components/AppShell';
import { StatusBadge } from '../components/StatusBadge';
import { VitalsTrendChart } from '../components/VitalsTrendChart';
import { DicomViewer } from '../components/DicomViewer';
import { vitalsSeries, type VisitWithConsultation } from '../utils/patientHistory';
import { doctorName, medicineLabel, vitalChips, whenToTake } from '../utils/visitFormat';
import { listDoctors } from '../api/doctors';
import { startVisit } from '../api/appointments';
import { CertificatesTab } from '../components/CertificatesTab';
import { GENDER_LABEL, formatDate, formatMoney } from '../utils/patientFormat';

type Tab = 'summary' | 'consultations' | 'vitals' | 'reports' | 'images' | 'certificates' | 'billing';
// `doctor`: only doctors and admin (who issue certificates on a doctor's
// behalf).
const TABS: { id: Tab; label: string; clinical: boolean; doctor?: boolean }[] = [
  { id: 'summary', label: 'Summary', clinical: false },
  { id: 'consultations', label: 'Consultations', clinical: true },
  { id: 'vitals', label: 'Vitals', clinical: true },
  { id: 'reports', label: 'Reports', clinical: true },
  { id: 'images', label: 'Images', clinical: true },
  { id: 'certificates', label: 'Certificates', clinical: true, doctor: true },
  { id: 'billing', label: 'Billing', clinical: false },
];

// The patient's hub: header with the key facts, then tabs. Clinical tabs
// are hidden from the front desk (the records API refuses them anyway).
export function PatientProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const canSeeClinical = user?.role !== 'RECEPTIONIST';
  const canEdit = !!user && ['ADMIN', 'RECEPTIONIST', 'DOCTOR'].includes(user.role);
  const canBookVisit = !!user && ['ADMIN', 'RECEPTIONIST'].includes(user.role);
  const canConsult = !!user && ['ADMIN', 'DOCTOR'].includes(user.role);
  const tabs = TABS.filter((t) => (canSeeClinical || !t.clinical) && (canConsult || !t.doctor));
  const requested = params.get('tab') as Tab | null;
  const tab: Tab = tabs.some((t) => t.id === requested) ? requested! : 'summary';

  const { data: patient, isError } = useQuery({ queryKey: ['patient', id], queryFn: () => getPatient(id!) });
  const { data: records } = useQuery({
    queryKey: ['patient-records', id],
    queryFn: () => getPatientRecords(id!),
    enabled: canSeeClinical,
  });

  if (isError) return <div className="px-6 py-10 text-red-600">Patient not found.</div>;
  if (!patient) return <div className="px-6 py-10 text-gray-500">Loading…</div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <ProfileHeader patient={patient} canEdit={canEdit} canBookVisit={canBookVisit} />

      <div className="mt-6 overflow-x-auto border-b border-gray-200" role="tablist">
        <div className="flex min-w-max gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setParams(t.id === 'summary' ? {} : { tab: t.id }, { replace: true })}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                tab === t.id ? 'border-teal text-teal' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {tab === 'summary' && <SummaryTab patient={patient} canEdit={canEdit} />}
        {tab === 'consultations' && (
          <ConsultationsTab records={records} canConsult={canConsult} canBookVisit={canBookVisit} patientId={patient.id} />
        )}
        {tab === 'vitals' && <VitalsTab records={records} />}
        {tab === 'reports' && <ReportsTab records={records} patientId={patient.id} />}
        {tab === 'images' && <ImagesTab records={records} patientId={patient.id} />}
        {tab === 'certificates' && <CertificatesTab patient={patient} />}
        {tab === 'billing' && <BillingTab patientId={patient.id} />}
      </div>
    </div>
  );
}

function Fact({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Icon name={icon} className="h-4 w-4 text-gray-400" />
      {children}
    </span>
  );
}

function ProfileHeader({ patient, canEdit, canBookVisit }: { patient: Patient; canEdit: boolean; canBookVisit: boolean }) {
  const place = [patient.city, patient.state].filter(Boolean).join(', ');
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-teal text-lg font-semibold text-white">
          {initials(patient.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-gray-900" data-testid="patient-name">
              {patient.name}
            </h1>
            <span className="rounded-md bg-teal-light px-2 py-0.5 font-mono text-sm text-teal" data-testid="patient-code">
              {patient.patientCode}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
            {patient.gender && <Fact icon="user">{GENDER_LABEL[patient.gender]}</Fact>}
            {patient.age != null && <Fact icon="calendar">{patient.age} years</Fact>}
            {patient.bloodGroup && <Fact icon="drop">{patient.bloodGroup}</Fact>}
            {patient.phone && <Fact icon="phone">{patient.phone}</Fact>}
            {patient.email && <Fact icon="mail">{patient.email}</Fact>}
            {place && <Fact icon="pin">{place}</Fact>}
          </div>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          {canBookVisit && (
            <Link to={`/admin/walk-in?patientId=${patient.id}`} className={`${btnPrimary} flex-1 sm:flex-none`}>
              <Icon name="plus" className="h-4 w-4" /> New visit
            </Link>
          )}
          {canEdit && (
            <Link to={`/patients/${patient.id}/edit`} className={`${btnSecondary} flex-1 sm:flex-none`}>
              <Icon name="edit" className="h-4 w-4" /> Edit
            </Link>
          )}
        </div>
      </div>
      {patient.allergies && (
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" data-testid="allergy-banner">
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-semibold">Allergies:</span> {patient.allergies}
          </span>
        </p>
      )}
    </section>
  );
}

function SummaryTab({ patient: p, canEdit }: { patient: Patient; canEdit: boolean }) {
  const bmi = p.heightCm && p.weightKg ? (p.weightKg / (p.heightCm / 100) ** 2).toFixed(1) : null;
  return (
    <div className="space-y-5">
      {canEdit && (
        <div className="flex justify-end">
          <Link to={`/patients/${p.id}/edit`} className="inline-flex items-center gap-1 text-sm font-medium text-teal hover:underline">
            <Icon name="edit" className="h-4 w-4" /> Edit details
          </Link>
        </div>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Personal">
          <dl className="grid grid-cols-2 gap-4">
            <Detail label="Date of birth" value={formatDate(p.dateOfBirth)} />
            <Detail label="Marital status" value={p.maritalStatus} />
            <Detail label="Occupation" value={p.occupation} />
            <Detail label="Nationality" value={p.nationality} />
            <Detail label="Referred by" value={p.referredBy} />
            <Detail label="Registered on" value={formatDate(p.registeredAt)} />
          </dl>
        </Card>
        <Card title="Contact">
          <dl className="grid grid-cols-2 gap-4">
            <Detail label="Mobile" value={p.phone} />
            <Detail label="Alternate mobile" value={p.alternatePhone} />
            <Detail label="Email" value={p.email} />
            <Detail label="Emergency contact" value={p.emergencyContact} />
            <Detail label="WhatsApp messages" value={p.whatsappOptIn ? 'Agreed' : 'Not agreed'} />
          </dl>
        </Card>
        <Card title="Address">
          <dl className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Detail label="Address" value={p.address} />
            </div>
            <Detail label="City" value={p.city} />
            <Detail label="State" value={p.state} />
            <Detail label="Pincode" value={p.pincode} />
          </dl>
        </Card>
        <Card title="Vitals baseline">
          <dl className="grid grid-cols-2 gap-4">
            <Detail label="Height" value={p.heightCm != null ? `${p.heightCm} cm` : null} />
            <Detail label="Weight" value={p.weightKg != null ? `${p.weightKg} kg` : null} />
            <Detail label="BMI" value={bmi} />
            <Detail label="Blood group" value={p.bloodGroup} />
          </dl>
        </Card>
      </div>
      <Card title="Medical history">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Known allergies" value={p.allergies} />
          <Detail label="Chronic diseases" value={p.chronicDiseases} />
          <Detail label="Past surgeries" value={p.pastSurgeries} />
          <Detail label="Family history" value={p.familyHistory} />
        </dl>
      </Card>
      <Card title="Additional">
        <dl className="grid gap-4 sm:grid-cols-3">
          <Detail label="Insurance details" value={p.insuranceDetails} />
          <Detail label="TPA" value={p.tpa} />
          <Detail label="Doctor notes" value={p.doctorNotes} />
        </dl>
      </Card>
    </div>
  );
}

function Loading() {
  return <p className="text-sm text-gray-500">Loading…</p>;
}

// "New consultation" from the profile: a doctor starts their own visit
// straight away; admin picks the doctor (skipped when there's only one).
function StartConsultation({ patientId }: { patientId: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN';
  const { data: doctors } = useQuery({ queryKey: ['doctors'], queryFn: listDoctors, enabled: isAdmin });
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = useMutation({
    mutationFn: (doctorId?: string) => startVisit({ patientId, doctorId }),
    onSuccess: (a) => navigate(`/doctor/consult/${a.id}`),
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not start the consultation'),
  });

  function begin() {
    if (!isAdmin) return start.mutate(undefined);
    if (doctors?.length === 1) return start.mutate(doctors[0]!.id);
    setPicking(true);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {picking && doctors ? (
        <select
          autoFocus
          defaultValue=""
          onChange={(e) => e.target.value && start.mutate(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          aria-label="Doctor for this consultation"
        >
          <option value="">Choose the doctor…</option>
          {doctors.map((d) => (
            <option key={d.id} value={d.id}>
              {doctorName(d.user.name)} — {d.specialization}
            </option>
          ))}
        </select>
      ) : (
        <button type="button" onClick={begin} disabled={start.isPending} className={btnPrimary} data-testid="new-consultation">
          <Icon name="plus" className="h-4 w-4" /> New consultation
        </button>
      )}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}

function ConsultationsTab({
  records,
  canConsult,
  canBookVisit,
  patientId,
}: {
  records?: PatientRecordsResponse;
  canConsult: boolean;
  canBookVisit: boolean;
  patientId: string;
}) {
  if (!records) return <Loading />;
  // Visits are numbered per patient, oldest first, counting consulted ones.
  const consulted = [...records.appointments]
    .filter((a) => a.consultation)
    .sort((a, b) => a.date.localeCompare(b.date) || a.tokenNumber - b.tokenNumber || a.createdAt.localeCompare(b.createdAt));
  const number = new Map(consulted.map((a, i) => [a.id, i + 1]));
  const visits = [...records.appointments]
    .filter((a) => a.status !== 'CANCELLED')
    .sort((a, b) => b.date.localeCompare(a.date) || b.tokenNumber - a.tokenNumber);
  return (
    <Card
      title="Consultation history"
      subtitle={`${consulted.length} visit${consulted.length === 1 ? '' : 's'} recorded`}
      actions={
        canConsult ? (
          <StartConsultation patientId={patientId} />
        ) : (
          canBookVisit && (
            <Link to={`/admin/walk-in?patientId=${patientId}`} className={btnPrimary}>
              <Icon name="plus" className="h-4 w-4" /> New visit
            </Link>
          )
        )
      }
    >
      {visits.length === 0 ? (
        <EmptyState>No visits recorded yet. Start the first consultation to build this patient's timeline.</EmptyState>
      ) : (
        <ol className="space-y-3">
          {visits.map((v, i) => (
            <VisitCard key={v.id} visit={v} visitNumber={number.get(v.id)} open={i === 0} canEdit={canConsult} />
          ))}
        </ol>
      )}
    </Card>
  );
}

function VisitCard({
  visit: v,
  visitNumber,
  open,
  canEdit,
}: {
  visit: PatientRecordsResponse['appointments'][number];
  visitNumber?: number;
  open: boolean;
  canEdit: boolean;
}) {
  const c = v.consultation;
  const chips = vitalChips(c?.vitals);
  const rows: [string, string | null | undefined][] = c
    ? [
        ['Chief complaint', c.chiefComplaint],
        ['Present illness', c.presentIllness],
        ['History', c.relevantHistory],
        ['Diagnosis', c.diagnosis],
        ['Differential diagnosis', c.differentialDiagnosis],
        ['Advice', c.notes],
        ['Imaging advice', c.imagingAdvice],
        ['Follow-up', c.followUpDate && formatDate(c.followUpDate)],
        ['Fee', formatMoney(v.consultationFee)],
        ['Doctor notes', c.doctorNotes],
      ]
    : [];
  return (
    <li data-testid="timeline-visit">
      <details open={open} className="group rounded-xl border border-gray-200">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-light text-teal">
            <Icon name="stethoscope" className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-gray-900">
              {visitNumber ? `Visit ${visitNumber}` : 'Visit'} · {formatDate(v.date)}
              {v.doctor && <span className="font-normal text-gray-500"> · {doctorName(v.doctor.user.name)}</span>}
            </span>
            <span className="block truncate text-sm text-gray-500">{c?.diagnosis || v.reason || 'No consultation recorded yet'}</span>
          </span>
          <span className="hidden sm:inline-flex">
            <StatusBadge status={v.status} />
          </span>
          <Icon name="chevronRight" className="h-4 w-4 text-gray-400 transition group-open:rotate-90" />
        </summary>
        {c ? (
          <div className="border-t border-gray-100 p-4">
            <div className="grid gap-5 md:grid-cols-2">
              <dl className="space-y-2.5">
                {rows
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</dt>
                      <dd className={`whitespace-pre-line text-sm ${label === 'Doctor notes' ? 'rounded bg-amber-50 px-2 py-1 text-amber-900' : 'text-gray-900'}`}>
                        {value}
                      </dd>
                    </div>
                  ))}
              </dl>
              <div className="space-y-4">
                {chips.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Vitals</p>
                    <div className="flex flex-wrap gap-1.5">
                      {chips.map((chip) => (
                        <span key={chip} className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {c.prescriptions.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">Prescription</p>
                    <ul className="space-y-1.5">
                      {c.prescriptions.map((rx) => (
                        <li key={rx.id} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
                          <span className="font-medium text-gray-900">
                            {medicineLabel(rx)}
                          </span>
                          <span className="block text-xs text-gray-500">
                            {whenToTake(rx)} · {rx.durationDays} days
                            {rx.totalToDispense != null ? ` · total ${rx.totalToDispense}` : ''}
                            {rx.notes ? ` · ${rx.notes}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {c.labTestsOrdered.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Lab tests ordered</p>
                    <p className="text-sm text-gray-800">{c.labTestsOrdered.map((o) => (o.notes ? `${o.testName} (${o.notes})` : o.testName)).join(', ')}</p>
                  </div>
                )}
                {c.radiologyOrdered.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Radiology work prescribed</p>
                    <p className="text-sm text-gray-800">{c.radiologyOrdered.map((o) => (o.notes ? `${o.testName} (${o.notes})` : o.testName)).join(', ')}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
              {canEdit && (
                <Link to={`/doctor/consult/${v.id}`} className={btnSecondary}>
                  <Icon name="edit" className="h-4 w-4" /> Edit this visit
                </Link>
              )}
              <Link to={`/visits/${v.id}/print`} className={btnSecondary} data-testid="print-summary">
                Print summary
              </Link>
            </div>
          </div>
        ) : (
          canEdit &&
          ['CHECKED_IN', 'IN_CONSULTATION'].includes(v.status) && (
            <div className="border-t border-gray-100 p-4">
              <Link to={`/doctor/consult/${v.id}`} className={btnPrimary}>
                Start consultation
              </Link>
            </div>
          )
        )}
      </details>
    </li>
  );
}

const VITALS = [
  { key: 'weightKg', label: 'Weight', unit: ' kg' },
  { key: 'pulse', label: 'Pulse', unit: ' bpm' },
  { key: 'bpSystolic', label: 'BP systolic', unit: '' },
  { key: 'bpDiastolic', label: 'BP diastolic', unit: '' },
  { key: 'tempF', label: 'Temperature', unit: ' °F' },
  { key: 'tempC', label: 'Temperature (earlier, °C)', unit: ' °C' },
  { key: 'spo2', label: 'SpO2', unit: '%' },
  { key: 'respiratoryRate', label: 'Respiratory rate', unit: '/min' },
  { key: 'bloodSugar', label: 'Blood sugar', unit: ' mg/dL' },
] as const;

function VitalsTab({ records }: { records?: PatientRecordsResponse }) {
  if (!records) return <Loading />;
  const visits = records.appointments.filter((a): a is VisitWithConsultation => !!a.consultation);
  const charts = VITALS.map((v) => ({ ...v, points: vitalsSeries(visits, v.key) })).filter((v) => v.points.length > 0);
  if (charts.length === 0) return <EmptyState>No vitals recorded yet.</EmptyState>;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {charts.map((c) => (
        <div key={c.key} className="rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
          <VitalsTrendChart label={c.label} unit={c.unit} points={c.points} />
        </div>
      ))}
    </div>
  );
}

const CATEGORY_LABEL: Record<string, string> = {
  LAB_REPORT: 'Lab report',
  RADIOLOGY_REPORT: 'Radiology report',
  PRESCRIPTION_SCAN: 'Prescription scan',
  RADIOLOGY_DICOM: 'DICOM image',
  PATIENT_REPORT: 'Report',
  PATIENT_IMAGE: 'Image',
  CONSENT_FORM: 'Signed consent form',
};

const UPLOAD_ROLES = ['ADMIN', 'DOCTOR', 'NURSE', 'HEAD_NURSE', 'RECEPTIONIST'];

// "Upload report" / "Upload image": files an outside document the patient
// brings straight to their record (PDF, JPG, PNG or WebP).
function UploadButton({ patientId, category, label }: { patientId: string; category: 'PATIENT_REPORT' | 'PATIENT_IMAGE'; label: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const upload = useMutation({
    mutationFn: (file: File) => uploadAttachment(category, patientId, file),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['patient-records', patientId] });
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not upload the file'),
    onSettled: () => {
      if (inputRef.current) inputRef.current.value = '';
    },
  });
  if (!user || !UPLOAD_ROLES.includes(user.role)) return null;
  return (
    <span className="flex flex-col items-end gap-1">
      <input
        ref={inputRef}
        type="file"
        accept={category === 'PATIENT_IMAGE' ? 'image/jpeg,image/png,image/webp,application/pdf' : 'application/pdf,image/jpeg,image/png,image/webp'}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])}
        data-testid={`upload-${category}`}
      />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={upload.isPending} className={btnSecondary}>
        <Icon name="plus" className="h-4 w-4" /> {upload.isPending ? 'Uploading…' : label}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

const isImageFile = (a: Attachment) => a.category === 'RADIOLOGY_DICOM' || a.category === 'PATIENT_IMAGE' || a.mimeType.startsWith('image/');

function FileRow({ a, onOpen }: { a: Attachment; onOpen: () => void }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-gray-900">{a.fileName}</span>
        <span className="text-xs text-gray-500">
          {CATEGORY_LABEL[a.category]} · {formatDate(a.createdAt)}
          {a.uploadedByName ? ` · ${a.uploadedByName}` : ''}
        </span>
      </span>
      <button type="button" onClick={onOpen} className="text-sm font-medium text-teal hover:underline">
        Open
      </button>
    </li>
  );
}

function ReportsTab({ records, patientId }: { records?: PatientRecordsResponse; patientId: string }) {
  if (!records) return <Loading />;
  const results = [
    ...records.labInvoices.flatMap((inv) => inv.items.map((i) => ({ ...i, kind: 'Lab', date: inv.createdAt }))),
    ...records.radiologyInvoices.flatMap((inv) => inv.items.map((i) => ({ ...i, kind: 'Radiology', date: inv.createdAt }))),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const files = records.attachments.filter((a) => !isImageFile(a));
  return (
    <div className="space-y-5">
      <Card title="Test results">
        {results.length === 0 ? (
          <p className="text-sm text-gray-500">No lab or radiology results yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {results.map((r) => (
              <li key={r.id} className="py-2.5 text-sm">
                <p className="font-medium text-gray-900">
                  {r.testName} <span className="font-normal text-gray-500">· {r.kind} · {formatDate(r.date)}</span>
                </p>
                <p className={`whitespace-pre-line ${r.resultText ? 'text-gray-700' : 'text-gray-400'}`}>
                  {r.resultText ?? 'Result pending'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Report files" actions={<UploadButton patientId={patientId} category="PATIENT_REPORT" label="Upload report" />}>
        {files.length === 0 ? (
          <p className="text-sm text-gray-500">No reports uploaded yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {files.map((a) => (
              <FileRow key={a.id} a={a} onOpen={() => openAttachment(a)} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ImagesTab({ records, patientId }: { records?: PatientRecordsResponse; patientId: string }) {
  const [dicom, setDicom] = useState<Attachment | null>(null);
  if (!records) return <Loading />;
  const images = records.attachments.filter(isImageFile);
  return (
    <Card title="Images" actions={<UploadButton patientId={patientId} category="PATIENT_IMAGE" label="Upload image" />}>
      {images.length === 0 ? (
        <p className="text-sm text-gray-500">No images uploaded yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {images.map((a) => (
            <FileRow key={a.id} a={a} onOpen={() => (a.category === 'RADIOLOGY_DICOM' ? setDicom(a) : openAttachment(a))} />
          ))}
        </ul>
      )}
      {dicom && <DicomViewer attachment={dicom} onClose={() => setDicom(null)} />}
    </Card>
  );
}

function BillingTab({ patientId }: { patientId: string }) {
  const { data } = useQuery({ queryKey: ['patient-billing', patientId], queryFn: () => getPatientBilling(patientId) });
  if (!data) return <Loading />;
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Billed', value: data.totalBilled, tone: 'text-gray-900' },
          { label: 'Paid', value: data.totalPaid, tone: 'text-teal' },
          { label: 'Due', value: data.totalDue, tone: data.totalDue > 0 ? 'text-red-600' : 'text-gray-900' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{s.label}</p>
            <p className={`mt-1 text-2xl font-semibold ${s.tone}`}>{formatMoney(s.value)}</p>
          </div>
        ))}
      </div>
      <Card title="Bills" subtitle={`${data.bills.length} billing record${data.bills.length === 1 ? '' : 's'}`}>
        {data.bills.length === 0 ? (
          <p className="text-sm text-gray-500">No bills yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100" data-testid="bills">
            {data.bills.map((b) => {
              const status =
                b.balanceDue > 0.01 ? (
                  <span className="text-xs text-red-600">{formatMoney(b.balanceDue)} due</span>
                ) : b.balanceDue < -0.01 ? (
                  <span className="text-xs text-amber-700">Refund due {formatMoney(-b.balanceDue)}</span>
                ) : (
                  <span className="text-xs text-teal">Paid</span>
                );
              const head = (
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${b.billType === 'IPD' ? 'bg-teal-light text-teal' : 'bg-gold-light text-gold'}`}>
                      <Icon name={b.billType === 'IPD' ? 'bed' : 'rupee'} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-gray-900">
                        {b.label}
                        {b.inProgress && <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-normal text-amber-800">In progress</span>}
                      </span>
                      <span className="text-xs text-gray-500">{formatDate(b.date)}</span>
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-semibold text-gray-900">{formatMoney(b.total)}</span>
                    {b.inProgress ? <span className="text-xs text-gray-500">Bill so far</span> : status}
                  </span>
                </span>
              );
              return (
                <li key={`${b.billType}:${b.billId}`} className="py-3" data-testid={b.billType === 'IPD' ? 'ipd-bill' : undefined}>
                  {b.breakdown?.length ? (
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                        <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-400 transition group-open:rotate-90" />
                        {head}
                      </summary>
                      <dl className="ml-6 mt-2 space-y-1 rounded-lg bg-gray-50 p-3 text-sm" data-testid="ipd-breakdown">
                        {b.breakdown.map((l) => (
                          <div key={l.label} className="flex justify-between gap-3">
                            <dt className="text-gray-600">{l.label}</dt>
                            <dd className={l.amount < 0 ? 'text-teal' : 'text-gray-900'}>{l.amount < 0 ? `− ${formatMoney(-l.amount)}` : formatMoney(l.amount)}</dd>
                          </div>
                        ))}
                        <div className="flex justify-between gap-3 border-t border-gray-200 pt-1 font-semibold">
                          <dt>{b.inProgress ? 'To pay so far' : b.balanceDue < 0 ? 'Refund due' : 'Balance due'}</dt>
                          <dd>{formatMoney(Math.abs(b.balanceDue))}</dd>
                        </div>
                      </dl>
                    </details>
                  ) : (
                    head
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
