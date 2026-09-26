import { useQuery } from '@tanstack/react-query';
import { getPatientRecords } from '../api/patients';
import { previousVisits } from '../utils/patientHistory';
import { doctorName, medicineLabel, vitalChips } from '../utils/visitFormat';
import { formatDate } from '../utils/patientFormat';

// A short summary of the patient's last consultation, shown at the top of
// a new one so the doctor has the context: complaint, diagnosis, vitals,
// what was prescribed and ordered, advice and the follow-up asked for.
export function PreviousVisitSummary({ patientId, currentAppointmentId }: { patientId: string; currentAppointmentId: string }) {
  const { data } = useQuery({ queryKey: ['patient-records', patientId], queryFn: () => getPatientRecords(patientId) });
  const visits = data ? previousVisits(data.appointments, currentAppointmentId) : [];
  const last = visits[0];
  if (!last) return null;
  const c = last.consultation;
  const tests = [...c.labTestsOrdered, ...c.radiologyOrdered].map((t) => t.testName);
  const row = (label: string, value: string | null | undefined) =>
    value ? (
      <div className="flex gap-2">
        <dt className="w-28 shrink-0 text-gray-500">{label}</dt>
        <dd className="min-w-0 flex-1 text-gray-900">{value}</dd>
      </div>
    ) : null;

  return (
    <section className="mb-5 rounded-2xl border border-sky-200 bg-sky-50/60 p-4 text-sm" data-testid="previous-visit-summary">
      <h2 className="mb-2 font-semibold text-gray-900">
        Last visit · {formatDate(last.date)}
        {last.doctor && <span className="font-normal text-gray-600"> · {doctorName(last.doctor.user.name)}</span>}
        {visits.length > 1 && <span className="font-normal text-gray-500"> · {visits.length} earlier visits</span>}
      </h2>
      <dl className="space-y-1">
        {row('Complaint', c.chiefComplaint)}
        {row('Diagnosis', c.diagnosis)}
        {row('Vitals', vitalChips(c.vitals).join(' · '))}
        {row('Medicines', c.prescriptions.map((p) => `${medicineLabel(p)} ${p.frequency}`).join('; '))}
        {row('Tests', tests.join(', '))}
        {row('Advice', c.notes)}
        {row('Follow-up', c.followUpDate ? formatDate(c.followUpDate) : null)}
      </dl>
    </section>
  );
}
