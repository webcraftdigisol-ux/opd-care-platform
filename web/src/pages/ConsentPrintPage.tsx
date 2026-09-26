import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getConsent } from '../api/consents';
import { PrintFrame, SignatureLine } from '../components/PrintFrame';
import { sexAge } from '../utils/patientFormat';
import { doctorName } from '../utils/visitFormat';
import { CONSENT_TITLE, consentDeclaration } from '../utils/consentText';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');

// The consent form as printed for signatures: patient and admission
// details, what will be done and what was explained, the standard
// declaration, and signature lines for patient/guardian, witness and doctor
// (plus an interpreter, when needed).
export function ConsentPrintPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { data: c, isError } = useQuery({ queryKey: ['consent-print', id], queryFn: () => getConsent(id) });
  if (isError) return <div className="px-6 py-10 text-red-600">Could not load this consent form.</div>;
  if (!c) return <div className="px-6 py-10 text-gray-500">Loading…</div>;
  const doctor = doctorName(c.doctorName);

  return (
    <PrintFrame clinic={c.clinic} title={CONSENT_TITLE[c.kind]} testId="consent-print">
      <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
        <Row label="Patient" value={`${c.patient.name}${c.patient.patientCode ? ` (${c.patient.patientCode})` : ''}`} />
        <Row label="Age / Sex" value={sexAge(c.patient.gender, c.patient.age) || '—'} />
        <Row label="Ward / Bed" value={`${c.ward} / ${c.bed}`} />
        <Row label="Admitted" value={when(c.admittedAt)} />
        <Row label="Procedure / surgery" value={c.procedureName} />
        <Row label="Doctor" value={[doctor, c.doctorQualification].filter(Boolean).join(', ')} />
        <Row label="Planned for" value={when(c.plannedAt) || '—'} />
        <Row label="Anaesthesia" value={c.anaesthesia ?? '—'} />
      </dl>

      {[
        ['Nature and purpose', c.purpose],
        ['Risks and possible complications', c.risks],
        ['Alternatives', c.alternatives],
      ].map(([label, text]) => (
        <section key={label} className="mt-4 break-inside-avoid">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600">{label}</h3>
          <p className="mt-1 min-h-[2.5rem] whitespace-pre-line border-b border-dotted border-gray-300 pb-1 text-sm">{text}</p>
        </section>
      ))}

      <section className="mt-5 space-y-2 text-sm leading-relaxed">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-600">Declaration</h3>
        {consentDeclaration(c.kind, c.procedureName, doctor).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </section>

      <section className="mt-8 grid grid-cols-2 gap-x-10 gap-y-6 break-inside-avoid">
        <SignatureLine
          label="Patient / guardian signature or thumb impression"
          name={c.signedByName ? `${c.signedByName} (${c.signerRelation})` : 'Name & relationship: ____________________'}
        />
        <SignatureLine label="Witness" name={c.witnessName ?? 'Name: ____________________'} />
        <SignatureLine label="Doctor" name={[doctor, c.doctorRegistrationNumber && `Reg. No. ${c.doctorRegistrationNumber}`].filter(Boolean).join(' · ')} />
        <SignatureLine label="Interpreter (if any)" name="Name: ____________________" />
      </section>
      <p className="mt-6 text-sm">Date &amp; time: {c.signedAt ? when(c.signedAt) : '____________________'}</p>
    </PrintFrame>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-gray-500">{label}:</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
