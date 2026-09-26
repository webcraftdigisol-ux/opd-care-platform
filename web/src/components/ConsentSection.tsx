import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConsentForm, ConsentKind, DoctorProfile } from '@opd/shared';
import { createConsent, deleteConsent, listConsents, signConsent } from '../api/consents';
import { Field, Modal, btnPrimary, btnSecondary, inputClass } from './ui';
import { Icon } from './Icon';
import { AttachmentPanel } from './AttachmentPanel';
import { doctorName } from '../utils/visitFormat';
import { CONSENT_KIND_LABEL, RELATIONS, RISK_HINT } from '../utils/consentText';

export const consentsKey = (admissionId: string) => ['consents', admissionId];

// Consent forms for procedures and surgery on this admission: write one,
// print it for signatures, record who signed, attach the signed scan.
export function ConsentSection({
  admissionId,
  patientName,
  admittingDoctorId,
  doctors,
  isAdmitted,
  canCreate,
}: {
  admissionId: string;
  patientName: string;
  admittingDoctorId: string;
  doctors: DoctorProfile[];
  isAdmitted: boolean;
  canCreate: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: consents } = useQuery({ queryKey: consentsKey(admissionId), queryFn: () => listConsents(admissionId) });
  const [creating, setCreating] = useState(false);
  const [signing, setSigning] = useState<ConsentForm | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: consentsKey(admissionId) });
  const remove = useMutation({ mutationFn: deleteConsent, onSuccess: refresh });

  return (
    <div className="mb-6 rounded-xl bg-white p-6 shadow-sm" data-testid="consent-section">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-gray-700">Consent forms</h2>
        {isAdmitted && canCreate && (
          <button type="button" onClick={() => setCreating(true)} className={btnSecondary} data-testid="new-consent">
            <Icon name="plus" className="h-4 w-4" /> New consent form
          </button>
        )}
      </div>
      {!consents?.length ? (
        <p className="text-sm text-gray-400">No consent forms yet. Create one before a procedure or surgery, print it and get it signed.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {consents.map((c) => (
            <li key={c.id} className="py-3" data-testid="consent-row">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-900">
                    {c.procedureName} <span className="text-sm font-normal text-gray-500">· {CONSENT_KIND_LABEL[c.kind]}</span>
                  </p>
                  <p className="text-sm text-gray-500">
                    {doctorName(c.doctorName)}
                    {c.plannedAt && ` · planned ${new Date(c.plannedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`}
                  </p>
                  {c.signedAt ? (
                    <p className="text-sm text-emerald-700" data-testid="consent-signed">
                      Signed by {c.signedByName} ({c.signerRelation}){c.witnessName ? `, witness ${c.witnessName}` : ''} ·{' '}
                      {new Date(c.signedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  ) : (
                    <p className="text-sm text-amber-700">Awaiting signature</p>
                  )}
                </div>
                <a href={`/consents/${c.id}/print`} target="_blank" rel="noreferrer" className={btnSecondary} data-testid="print-consent">
                  Print
                </a>
                {!c.signedAt && (
                  <button type="button" onClick={() => setSigning(c)} className={btnPrimary} data-testid="mark-signed">
                    Mark signed
                  </button>
                )}
                {c.signedAt && (
                  <button type="button" onClick={() => setOpen(open === c.id ? null : c.id)} className="text-sm text-teal hover:underline">
                    {open === c.id ? 'Hide scan' : 'Signed copy'}
                  </button>
                )}
                {!c.signedAt && canCreate && (
                  <button
                    type="button"
                    onClick={() => window.confirm(`Delete the unsigned consent for ${c.procedureName}?`) && remove.mutate(c.id)}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                )}
              </div>
              {open === c.id && (
                <div className="mt-2">
                  <AttachmentPanel category="CONSENT_FORM" entityId={c.id} label="Signed consent (scan or photo)" />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <NewConsentDialog
          admissionId={admissionId}
          doctors={doctors}
          defaultDoctorId={admittingDoctorId}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            refresh();
          }}
        />
      )}
      {signing && (
        <SignDialog
          consent={signing}
          patientName={patientName}
          onClose={() => setSigning(null)}
          onDone={() => {
            setOpen(signing.id);
            setSigning(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function NewConsentDialog({
  admissionId,
  doctors,
  defaultDoctorId,
  onClose,
  onDone,
}: {
  admissionId: string;
  doctors: DoctorProfile[];
  defaultDoctorId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [f, setF] = useState({
    kind: 'SURGERY' as ConsentKind,
    procedureName: '',
    doctorId: defaultDoctorId,
    plannedAt: '',
    anaesthesia: '',
    purpose: '',
    risks: '',
    alternatives: '',
  });
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      createConsent(admissionId, {
        ...f,
        plannedAt: f.plannedAt ? new Date(f.plannedAt).toISOString() : null,
      }),
    onSuccess: onDone,
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not save'),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Modal title="New consent form" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="space-y-3"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type" required>
            <select value={f.kind} onChange={set('kind')} className={inputClass} data-testid="consent-kind">
              {Object.entries(CONSENT_KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Doctor performing" required>
            <select value={f.doctorId} onChange={set('doctorId')} className={inputClass}>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {doctorName(d.user.name)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Procedure / surgery" required>
          <input required value={f.procedureName} onChange={set('procedureName')} placeholder="e.g. Laparoscopic appendectomy" className={inputClass} data-testid="consent-procedure" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Planned for">
            <input type="datetime-local" value={f.plannedAt} onChange={set('plannedAt')} className={inputClass} />
          </Field>
          <Field label="Anaesthesia">
            <input value={f.anaesthesia} onChange={set('anaesthesia')} placeholder="e.g. General, Spinal, Local" className={inputClass} />
          </Field>
        </div>
        <Field label="Nature and purpose (as explained)">
          <textarea rows={2} value={f.purpose} onChange={set('purpose')} className={inputClass} />
        </Field>
        <Field label="Risks and complications explained">
          <textarea rows={3} value={f.risks} onChange={set('risks')} placeholder={RISK_HINT[f.kind]} className={inputClass} data-testid="consent-risks" />
        </Field>
        <Field label="Alternatives explained">
          <textarea rows={2} value={f.alternatives} onChange={set('alternatives')} className={inputClass} />
        </Field>
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" disabled={save.isPending} className={btnPrimary} data-testid="save-consent">
            Save consent form
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SignDialog({ consent, patientName, onClose, onDone }: { consent: ConsentForm; patientName: string; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ signedByName: patientName, signerRelation: 'Self', witnessName: '' });
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => signConsent(consent.id, f),
    onSuccess: onDone,
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not save'),
  });
  return (
    <Modal title={`Consent signed: ${consent.procedureName}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="space-y-3"
      >
        <p className="text-sm text-gray-600">Record who signed the printed form. You can attach a scan of it next.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Signed by" required>
            <input required value={f.signedByName} onChange={(e) => setF((x) => ({ ...x, signedByName: e.target.value }))} className={inputClass} data-testid="signer-name" />
          </Field>
          <Field label="Relationship to patient" required>
            <select
              value={f.signerRelation}
              onChange={(e) => setF((x) => ({ ...x, signerRelation: e.target.value }))}
              className={inputClass}
              data-testid="signer-relation"
            >
              {RELATIONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Witness">
          <input value={f.witnessName} onChange={(e) => setF((x) => ({ ...x, witnessName: e.target.value }))} className={inputClass} data-testid="witness-name" />
        </Field>
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" disabled={save.isPending} className={btnPrimary} data-testid="confirm-signed">
            Mark signed
          </button>
        </div>
      </form>
    </Modal>
  );
}
