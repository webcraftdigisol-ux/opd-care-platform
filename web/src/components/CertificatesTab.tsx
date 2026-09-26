import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CertificateType, Patient } from '@opd/shared';
import { issueCertificate, listCertificates } from '../api/certificates';
import { listDoctors } from '../api/doctors';
import { useAuth } from '../context/AuthContext';
import { Card, EmptyState, Field, Modal, btnPrimary, btnSecondary, inputClass } from './ui';
import { Icon } from './Icon';
import { formatDate } from '../utils/patientFormat';
import { doctorName } from '../utils/visitFormat';
import { localDate } from '../pages/AppointmentsPage';
import { CERTIFICATE_FIELDS, CERTIFICATE_LABEL, certificateBody } from '../utils/certificateText';

// Certificates the doctor has issued to this patient, and a form to issue
// a new one -- fitness, sick leave, fit to resume, fit to travel, general --
// with suggested wording the doctor can edit before printing.
export function CertificatesTab({ patient }: { patient: Patient }) {
  const key = ['certificates', patient.id];
  const { data: certificates } = useQuery({ queryKey: key, queryFn: () => listCertificates(patient.id) });
  const [issuing, setIssuing] = useState(false);
  const queryClient = useQueryClient();
  return (
    <Card
      title="Certificates"
      subtitle="Printable on the clinic's letterhead"
      actions={
        <button type="button" onClick={() => setIssuing(true)} className={btnPrimary} data-testid="new-certificate">
          <Icon name="plus" className="h-4 w-4" /> New certificate
        </button>
      }
    >
      {!certificates?.length ? (
        <EmptyState>No certificates issued yet.</EmptyState>
      ) : (
        <ul className="divide-y divide-gray-100">
          {certificates.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 py-3" data-testid="certificate-row">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-light text-teal">
                <Icon name="records" className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-gray-900">{CERTIFICATE_LABEL[c.type]}</span>
                <span className="text-xs text-gray-500">
                  {c.certificateNo} · {formatDate(c.issuedAt)} · {doctorName(c.doctorName)}
                </span>
              </span>
              <a href={`/certificates/${c.id}/print`} target="_blank" rel="noreferrer" className={btnSecondary} data-testid="print-certificate">
                Print
              </a>
            </li>
          ))}
        </ul>
      )}
      {issuing && (
        <IssueDialog
          patient={patient}
          onClose={() => setIssuing(false)}
          onDone={(id) => {
            setIssuing(false);
            queryClient.invalidateQueries({ queryKey: key });
            window.open(`/certificates/${id}/print`, '_blank');
          }}
        />
      )}
    </Card>
  );
}

function IssueDialog({ patient, onClose, onDone }: { patient: Patient; onClose: () => void; onDone: (id: string) => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const { data: doctors } = useQuery({ queryKey: ['doctors'], queryFn: listDoctors, enabled: isAdmin });
  const today = localDate();
  const [type, setType] = useState<CertificateType>('MEDICAL_FITNESS');
  const [f, setF] = useState({ diagnosis: '', fromDate: today, toDate: today, purpose: '', doctorId: '' });
  // The wording follows the details until the doctor edits it by hand.
  const [edited, setEdited] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fields = CERTIFICATE_FIELDS[type];
  const suggested = certificateBody(type, {
    name: patient.name,
    age: patient.age,
    gender: patient.gender,
    diagnosis: fields.diagnosis ? f.diagnosis : '',
    fromDate: fields.fromDate ? f.fromDate : '',
    toDate: fields.toDate ? f.toDate : '',
    purpose: fields.purpose ? f.purpose : '',
    today,
  });
  const body = edited ?? suggested;

  const issue = useMutation({
    mutationFn: () =>
      issueCertificate(patient.id, {
        type,
        doctorId: isAdmin ? f.doctorId || undefined : undefined,
        diagnosis: fields.diagnosis ? f.diagnosis : null,
        fromDate: fields.fromDate ? f.fromDate || null : null,
        toDate: fields.toDate ? f.toDate || null : null,
        purpose: fields.purpose ? f.purpose : null,
        body,
      }),
    onSuccess: (c) => onDone(c.id),
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not issue the certificate'),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <Modal title="New certificate" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          issue.mutate();
        }}
        className="space-y-3"
      >
        <Field label="Certificate" required>
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value as CertificateType);
              setEdited(null);
            }}
            className={inputClass}
            data-testid="certificate-type"
          >
            {Object.entries(CERTIFICATE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        {isAdmin && (
          <Field label="Issued by" required>
            <select required value={f.doctorId} onChange={set('doctorId')} className={inputClass} data-testid="certificate-doctor">
              <option value="">Choose the doctor</option>
              {doctors?.map((d) => (
                <option key={d.id} value={d.id}>
                  {doctorName(d.user.name)}
                </option>
              ))}
            </select>
          </Field>
        )}
        {fields.diagnosis && (
          <Field label={fields.diagnosis}>
            <input value={f.diagnosis} onChange={set('diagnosis')} className={inputClass} data-testid="certificate-diagnosis" />
          </Field>
        )}
        {(fields.fromDate || fields.toDate) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.fromDate && (
              <Field label={fields.fromDate}>
                <input type="date" value={f.fromDate} onChange={set('fromDate')} className={inputClass} data-testid="certificate-from" />
              </Field>
            )}
            {fields.toDate && (
              <Field label={fields.toDate}>
                <input type="date" value={f.toDate} min={f.fromDate} onChange={set('toDate')} className={inputClass} data-testid="certificate-to" />
              </Field>
            )}
          </div>
        )}
        {fields.purpose && (
          <Field label={fields.purpose}>
            <input value={f.purpose} onChange={set('purpose')} className={inputClass} data-testid="certificate-purpose" />
          </Field>
        )}
        <Field label="Certificate text" hint="Suggested from the details above — edit freely.">
          <textarea rows={6} value={body} onChange={(e) => setEdited(e.target.value)} className={inputClass} data-testid="certificate-body" />
        </Field>
        {edited !== null && (
          <button type="button" onClick={() => setEdited(null)} className="text-xs text-teal hover:underline">
            Use the suggested wording again
          </button>
        )}
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" disabled={issue.isPending || !body.trim()} className={btnPrimary} data-testid="issue-certificate">
            Issue &amp; print
          </button>
        </div>
      </form>
    </Modal>
  );
}
