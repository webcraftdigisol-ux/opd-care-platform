import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCertificate } from '../api/certificates';
import { PrintFrame, SignatureLine } from '../components/PrintFrame';
import { sexAge } from '../utils/patientFormat';
import { doctorName } from '../utils/visitFormat';
import { CERTIFICATE_LABEL } from '../utils/certificateText';

// A certificate on the clinic's letterhead: number and date, the patient,
// the approved wording, and the doctor's signature block with their
// qualification and registration number.
export function CertificatePrintPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { data: c, isError } = useQuery({ queryKey: ['certificate-print', id], queryFn: () => getCertificate(id) });
  if (isError) return <div className="px-6 py-10 text-red-600">Could not load this certificate.</div>;
  if (!c) return <div className="px-6 py-10 text-gray-500">Loading…</div>;
  const issued = new Date(c.issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <PrintFrame clinic={c.clinic} title={CERTIFICATE_LABEL[c.type]} testId="certificate-print">
      <div className="mt-4 flex justify-between text-sm">
        <span>
          Certificate no: <span className="font-mono font-medium">{c.certificateNo}</span>
        </span>
        <span>Date: {issued}</span>
      </div>
      <p className="mt-2 text-sm text-gray-600">
        Patient: <span className="font-medium text-gray-900">{c.patient.name}</span>
        {[c.patient.patientCode, sexAge(c.patient.gender, c.patient.age)].filter(Boolean).map((x) => ` · ${x}`)}
      </p>
      <p className="mt-10 whitespace-pre-line text-base leading-8" data-testid="certificate-body-print">
        {c.body}
      </p>
      <div className="mt-24 flex items-end justify-between gap-10">
        <div className="w-56">
          <SignatureLine label="Signature / thumb impression of patient" />
        </div>
        <div className="w-64 text-right">
          <div className="h-12 border-b border-gray-400" />
          <p className="mt-1 font-semibold">{doctorName(c.doctorName)}</p>
          {c.doctorQualification && <p className="text-sm text-gray-700">{c.doctorQualification}</p>}
          {c.doctorRegistrationNumber && <p className="text-sm text-gray-700">Reg. No. {c.doctorRegistrationNumber}</p>}
          <p className="text-xs text-gray-500">(Seal &amp; signature)</p>
        </div>
      </div>
    </PrintFrame>
  );
}
