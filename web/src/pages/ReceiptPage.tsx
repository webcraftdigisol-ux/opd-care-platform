import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { Department } from '@opd/shared';
import { getReceipt } from '../api/departments';
import { btnPrimary } from '../components/ui';
import { sexAge } from '../utils/patientFormat';
import { doctorName } from '../utils/visitFormat';
import { money } from '../utils/departments';

const DEPT_OF: Record<string, Department> = { pharmacy: 'PHARMACY', lab: 'LAB', radiology: 'RADIOLOGY' };
const TITLE: Record<Department, string> = { PHARMACY: 'Pharmacy receipt', LAB: 'Laboratory receipt', RADIOLOGY: 'Radiology receipt' };
const METHOD: Record<string, string> = { CASH: 'Cash', CARD: 'Card', UPI: 'UPI', NETBANKING: 'Net banking', WALLET: 'Wallet', RAZORPAY: 'Online' };

// A department receipt as a printable page (A5-ish width), like the visit
// summary: print it or save it as PDF from the browser.
export function ReceiptPage() {
  const { dept = '', billId = '' } = useParams<{ dept: string; billId: string }>();
  const navigate = useNavigate();
  const department = DEPT_OF[dept];
  const { data: r, isError, error } = useQuery({
    queryKey: ['receipt', dept, billId],
    queryFn: () => getReceipt(department!, billId),
    enabled: !!department,
  });

  if (!department) return <div className="px-6 py-10 text-red-600">Unknown receipt type.</div>;
  if (isError) return <div className="px-6 py-10 text-red-600">{(error as any)?.response?.data?.message ?? 'Could not load this receipt.'}</div>;
  if (!r) return <div className="px-6 py-10 text-gray-500">Loading…</div>;

  const when = new Date(r.createdAt);
  return (
    <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[160mm] items-center gap-2 px-4 print:hidden">
        <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : window.close())} className="mr-auto text-sm text-gray-600 hover:text-teal">
          ← Back
        </button>
        <button type="button" onClick={() => window.print()} className={btnPrimary}>
          Print
        </button>
      </div>
      <article className="mx-auto max-w-[160mm] bg-white p-8 shadow-sm print:max-w-none print:p-0 print:shadow-none" data-testid="receipt">
        <header className="border-b-2 border-teal pb-3 text-center">
          <h1 className="text-xl font-bold text-gray-900">{r.clinic.name}</h1>
          {(r.clinic.address || r.clinic.phone) && (
            <p className="text-xs text-gray-600">{[r.clinic.address, r.clinic.phone && `Ph: ${r.clinic.phone}`].filter(Boolean).join(' · ')}</p>
          )}
          <p className="mt-2 text-sm font-semibold uppercase tracking-wider text-teal">{TITLE[r.billType]}</p>
        </header>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <div>
            <dt className="inline text-gray-500">Receipt no: </dt>
            <dd className="inline font-mono font-medium">{r.receiptNo}</dd>
          </div>
          <div className="text-right">
            <dt className="inline text-gray-500">Date: </dt>
            <dd className="inline">{when.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</dd>
          </div>
          <div>
            <dt className="inline text-gray-500">Patient: </dt>
            <dd className="inline font-medium" data-testid="receipt-patient">
              {r.patient.name}
            </dd>
            <span className="text-gray-500"> {[r.patient.patientCode, sexAge(r.patient.gender, r.patient.age)].filter(Boolean).join(' · ')}</span>
          </div>
          <div className="text-right">
            {r.doctorName && (
              <>
                <dt className="inline text-gray-500">Doctor: </dt>
                <dd className="inline">{doctorName(r.doctorName)}</dd>
              </>
            )}
          </div>
        </dl>

        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-y border-gray-300 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-1.5 pr-2">#</th>
              <th className="py-1.5 pr-2">{r.billType === 'PHARMACY' ? 'Medicine' : 'Test'}</th>
              <th className="py-1.5 pr-2 text-right">Qty</th>
              <th className="py-1.5 pr-2 text-right">Rate</th>
              <th className="py-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {r.lines.map((l, i) => (
              <tr key={i} className="border-b border-gray-100 align-top" data-testid="receipt-line">
                <td className="py-1.5 pr-2 text-gray-500">{i + 1}</td>
                <td className="py-1.5 pr-2">
                  {l.description}
                  {l.detail && <span className="block text-xs text-gray-500">{l.detail}</span>}
                </td>
                <td className="py-1.5 pr-2 text-right">{l.quantity}</td>
                <td className="py-1.5 pr-2 text-right">{money(l.unitPrice)}</td>
                <td className="py-1.5 text-right">{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto mt-3 w-64 space-y-1 text-sm">
          <Row label="Subtotal" value={money(r.subtotal)} />
          {r.taxAmount > 0 && <Row label={`Tax (${r.taxPercent}%)`} value={money(r.taxAmount)} />}
          <Row label="Total" value={money(r.total)} strong testId="receipt-total" />
          <Row label="Paid" value={money(r.paid)} />
          {r.balance > 0 && <Row label="Balance due" value={money(r.balance)} strong />}
        </div>

        {r.payments.length > 0 && (
          <p className="mt-3 text-xs text-gray-500">
            Paid by {r.payments.map((p) => `${METHOD[p.method] ?? p.method} ${money(p.amount)}`).join(', ')}
          </p>
        )}
        <footer className="mt-8 flex items-end justify-between text-xs text-gray-500">
          <span>{r.preparedBy && `Prepared by ${r.preparedBy}`}</span>
          <span>Thank you. Get well soon.</span>
        </footer>
      </article>
    </div>
  );
}

function Row({ label, value, strong, testId }: { label: string; value: string; strong?: boolean; testId?: string }) {
  return (
    <div className={`flex justify-between ${strong ? 'border-t border-gray-200 pt-1 font-semibold text-gray-900' : 'text-gray-700'}`}>
      <span>{label}</span>
      <span data-testid={testId}>{value}</span>
    </div>
  );
}
