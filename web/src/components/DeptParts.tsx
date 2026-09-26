import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Department, DeptPatient } from '@opd/shared';
import { Card, Field, Modal, btnPrimary, btnSecondary, inputClass } from './ui';
import { Icon } from './Icon';
import { PaymentRecorder } from './PaymentRecorder';
import { sexAge } from '../utils/patientFormat';
import { DEPTS, SKIP_REASONS, money } from '../utils/departments';

// Pieces shared by the pharmacy, lab and radiology patient pages.

export function DeptPatientHeader({ dept, patient }: { dept: Department; patient: DeptPatient }) {
  const info = DEPTS[dept];
  return (
    <>
      <Link to={info.base} className="mb-3 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-teal">
        <Icon name="chevronLeft" className="h-4 w-4" /> {info.label}
      </Link>
      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-light text-lg font-semibold text-teal">
            {patient.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-gray-900" data-testid="dept-patient-name">
              {patient.name}
            </h1>
            <p className="text-sm text-gray-500">
              {[patient.patientCode, sexAge(patient.gender, patient.age), patient.phone].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
      </Card>
    </>
  );
}

// "Not doing this here": a reason, picked or typed.
export function SkipDialog({
  dept,
  what,
  onClose,
  onConfirm,
  busy,
}: {
  dept: Department;
  what: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  busy?: boolean;
}) {
  const [reason, setReason] = useState(SKIP_REASONS[dept][0]!);
  return (
    <Modal title={`Not ${dept === 'PHARMACY' ? 'dispensing' : 'doing'} ${what}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(reason);
        }}
      >
        <p className="mb-3 text-sm text-gray-600">It will leave the waiting list. You can undo this later.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {SKIP_REASONS[dept].map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setReason(r)}
              className={`rounded-full border px-3 py-1 text-sm ${reason === r ? 'border-teal bg-teal-light text-teal' : 'border-gray-300 text-gray-700'}`}
            >
              {r}
            </button>
          ))}
        </div>
        <Field label="Reason">
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} maxLength={200} />
        </Field>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={btnPrimary} data-testid="confirm-skip">
            Confirm
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Shown once a bill is created: take the payment and print the receipt.
export function ReceiptCreated({
  dept,
  billId,
  total,
  count,
  onDone,
}: {
  dept: Department;
  billId: string;
  total: number;
  count: number;
  onDone: () => void;
}) {
  const info = DEPTS[dept];
  return (
    <Card className="mb-5 border-teal/40">
      <div className="flex flex-wrap items-center gap-3" data-testid="receipt-created">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-teal text-white">
          <Icon name="check" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900">
            Receipt created · {count} {count === 1 ? info.item : info.items} · {money(total)}
          </p>
          <p className="text-sm text-gray-500">Record the payment, then print the receipt for the patient.</p>
        </div>
        <a href={`/receipts/${info.base.slice(1)}/${billId}`} target="_blank" rel="noreferrer" className={btnPrimary} data-testid="print-receipt">
          Print receipt
        </a>
        <button type="button" onClick={onDone} className={btnSecondary}>
          Done
        </button>
      </div>
      <PaymentRecorder billType={dept} billId={billId} />
    </Card>
  );
}

export function StatusPill({ tone, children }: { tone: 'done' | 'skipped' | 'swap' | 'warn'; children: React.ReactNode }) {
  const cls = {
    done: 'bg-emerald-50 text-emerald-700',
    skipped: 'bg-gray-100 text-gray-600',
    swap: 'bg-amber-50 text-amber-800',
    warn: 'bg-red-50 text-red-700',
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{children}</span>;
}
