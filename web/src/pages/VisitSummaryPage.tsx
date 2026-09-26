import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { downloadVisitSummaryPdf, getVisitSummary, sendVisitSummaryWhatsApp } from '../api/consultations';
import { useAuth } from '../context/AuthContext';
import { btnPrimary, btnSecondary } from '../components/ui';
import { formatDate } from '../utils/patientFormat';
import { doctorName, vitalChips, whenToTake } from '../utils/visitFormat';

const SEX: Record<string, string> = { MALE: 'M', FEMALE: 'F', OTHER: 'O' };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 break-inside-avoid">
      <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-teal">{title}</h2>
      <div className="text-sm text-gray-900">{children}</div>
    </section>
  );
}

// The patient's Visit Summary, laid out as an A4 page: print it or save it
// as PDF from the browser, download the server's PDF, or send it on
// WhatsApp. Shows only what the patient should get -- no differential
// diagnosis, relevant history, fee or private notes.
export function VisitSummaryPage() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canSend = user?.role === 'DOCTOR' || user?.role === 'ADMIN';
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const { data: s, isError, error } = useQuery({ queryKey: ['visit-summary', appointmentId], queryFn: () => getVisitSummary(appointmentId!) });

  const send = useMutation({
    mutationFn: () => sendVisitSummaryWhatsApp(appointmentId!),
    onSuccess: (n) => setStatus(n.status === 'SENT' ? { ok: true, text: 'Sent on WhatsApp.' } : { ok: false, text: `Not sent: ${n.error}` }),
    onError: (err: any) => setStatus({ ok: false, text: err.response?.data?.message ?? 'Could not send' }),
  });

  if (isError) return <div className="px-6 py-10 text-red-600">{(error as any)?.response?.data?.message ?? 'Could not load this visit.'}</div>;
  if (!s) return <div className="px-6 py-10 text-gray-500">Loading…</div>;

  const chips = vitalChips(s.vitals);
  const ageSex = [s.patient.age != null ? `${s.patient.age} yrs` : null, s.patient.gender ? SEX[s.patient.gender] : null].filter(Boolean).join(' / ');
  const fileName = `Visit_Summary_${s.patient.patientCode}_${s.date}.pdf`;

  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-2 px-4 print:hidden">
        <button type="button" onClick={() => navigate(-1)} className="mr-auto text-sm text-gray-600 hover:text-teal">
          ← Back
        </button>
        {status && <span className={`text-sm ${status.ok ? 'text-teal' : 'text-red-600'}`}>{status.text}</span>}
        {canSend && (
          <button type="button" onClick={() => send.mutate()} disabled={send.isPending} className={btnSecondary}>
            Send on WhatsApp
          </button>
        )}
        <button type="button" onClick={() => downloadVisitSummaryPdf(s.appointmentId, fileName)} className={btnSecondary}>
          Download PDF
        </button>
        <button type="button" onClick={() => window.print()} className={btnPrimary}>
          Print / Save as PDF
        </button>
      </div>

      <article
        className="mx-auto min-h-[297mm] max-w-[210mm] bg-white px-[14mm] py-[12mm] shadow-sm print:min-h-0 print:shadow-none"
        data-testid="visit-summary"
      >
        <header className="flex items-start justify-between gap-6 border-b-2 border-teal pb-3">
          <div>
            <p className="text-xl font-bold text-teal">{s.clinic.name}</p>
            {s.clinic.address && <p className="text-xs text-gray-500">{s.clinic.address}</p>}
            {s.clinic.phone && <p className="text-xs text-gray-500">Phone: {s.clinic.phone}</p>}
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-gray-900">Visit Summary</p>
            <p className="text-xs text-gray-500">
              Visit {s.visitNumber} · {formatDate(s.date)}
              {s.time ? ` · ${s.time}` : ''}
            </p>
          </div>
        </header>

        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {[
            ['Patient', s.patient.name],
            ['Patient ID', s.patient.patientCode],
            ['Age / Sex', ageSex || '—'],
            ['Doctor', `${doctorName(s.doctor.name)}${s.doctor.qualification ? `, ${s.doctor.qualification}` : ''}`],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-[10px] uppercase tracking-wide text-gray-500">{label}</dt>
              <dd className="font-semibold text-gray-900">{value}</dd>
            </div>
          ))}
        </dl>

        {s.symptoms.length > 0 && (
          <Section title="Symptoms">
            {s.symptoms.map((x) => (
              <p key={x}>{x}</p>
            ))}
          </Section>
        )}
        {s.diagnosis && (
          <Section title="Diagnosis">
            <p>{s.diagnosis}</p>
          </Section>
        )}
        {chips.length > 0 && (
          <Section title="Vitals">
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <span key={c} className="rounded-md bg-gray-100 px-2 py-0.5 text-xs print:border print:border-gray-300 print:bg-white">
                  {c}
                </span>
              ))}
            </div>
          </Section>
        )}
        {s.prescriptions.length > 0 && (
          <Section title="Prescription">
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] uppercase tracking-wide text-gray-500">
                <tr className="border-b border-gray-200">
                  <th className="py-1 pr-2 font-semibold">Medicine</th>
                  <th className="py-1 pr-2 font-semibold">When to take</th>
                  <th className="py-1 pr-2 font-semibold">Duration</th>
                  <th className="py-1 pr-2 font-semibold">Instructions</th>
                  <th className="py-1 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {s.prescriptions.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100 align-top">
                    <td className="py-1.5 pr-2 font-medium">
                      {p.medicine}
                      {p.strength ? ` (${p.strength})` : ''}
                    </td>
                    <td className="py-1.5 pr-2">{whenToTake(p)}</td>
                    <td className="py-1.5 pr-2">{p.durationDays} day(s)</td>
                    <td className="py-1.5 pr-2">{p.notes}</td>
                    <td className="py-1.5">{p.totalToDispense ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}
        {s.labTests.length > 0 && (
          <Section title="Investigations / lab tests advised">
            <ul className="list-inside list-disc">
              {s.labTests.map((t, i) => (
                <li key={i}>
                  {t.name}
                  {t.notes ? ` — ${t.notes}` : ''}
                </li>
              ))}
            </ul>
          </Section>
        )}
        {s.radiology.length > 0 && (
          <Section title="Radiology work prescribed">
            <ul className="list-inside list-disc">
              {s.radiology.map((t, i) => (
                <li key={i}>
                  {t.name}
                  {t.notes ? ` — ${t.notes}` : ''}
                </li>
              ))}
            </ul>
          </Section>
        )}
        {s.imagingAdvice && (
          <Section title="Ultrasound / imaging advice">
            <p>{s.imagingAdvice}</p>
          </Section>
        )}
        {s.advice && (
          <Section title="Doctor's advice">
            <p className="whitespace-pre-line">{s.advice}</p>
          </Section>
        )}

        <footer className="mt-12 flex items-end justify-between gap-6 break-inside-avoid">
          <p className="text-sm font-semibold">{s.followUpDate ? `Follow-up: ${formatDate(s.followUpDate)}` : ''}</p>
          <div className="w-60 text-right">
            <div className="mb-1 border-t border-gray-400" />
            <p className="text-[10px] text-gray-500">Doctor's signature</p>
            <p className="text-sm font-semibold">{doctorName(s.doctor.name)}</p>
            {(s.doctor.qualification || s.doctor.registrationNumber) && (
              <p className="text-[10px] text-gray-500">
                {[s.doctor.qualification, s.doctor.registrationNumber && `Reg. No. ${s.doctor.registrationNumber}`].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </footer>
      </article>
      <p className="mt-4 text-center text-xs text-gray-400 print:hidden">
        <Link to={`/patients/${s.patient.id}?tab=consultations`} className="hover:text-teal">
          Open {s.patient.name}'s profile
        </Link>
      </p>
    </div>
  );
}
