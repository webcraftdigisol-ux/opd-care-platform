import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBillPaymentOrder, getBillPayments, getRazorpayStatus, recordPayment, verifyBillPayment } from '../api/payments';
import { openRazorpayCheckout } from '../utils/razorpayCheckout';
import { useAuth } from '../context/AuthContext';
import type { BillType, PaymentMethod } from '@opd/shared';

const METHODS: PaymentMethod[] = ['CASH', 'CARD', 'UPI', 'NETBANKING', 'WALLET'];

const BILL_TYPE_LABEL: Record<BillType, string> = {
  CONSULTATION: 'Consultation fee',
  PHARMACY: 'Pharmacy bill',
  LAB: 'Lab bill',
  RADIOLOGY: 'Radiology bill',
  IPD: 'Admission bill',
};

export function PaymentRecorder({ billType, billId }: { billType: BillType; billId: string }) {
  const { user, clinic } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['bill-payments', billType, billId];
  const { data } = useQuery({ queryKey, queryFn: () => getBillPayments(billType, billId) });
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [error, setError] = useState<string | null>(null);

  // A patient only ever sees their own bill here and can't manually record
  // a payment (that's staff-only server-side too) -- they get a "Pay
  // Online" button instead of the amount/method form below.
  const isPatient = user?.role === 'PATIENT';

  const { data: razorpayStatus } = useQuery({
    queryKey: ['razorpay-status'],
    queryFn: getRazorpayStatus,
    enabled: isPatient,
    staleTime: 5 * 60 * 1000,
  });

  const mutation = useMutation({
    mutationFn: () => recordPayment({ billType, billId, amount: Number(amount), method }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setAmount('');
      setError(null);
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not record payment'),
  });

  // Create the order, open Razorpay's Checkout modal, then hand its signed
  // callback straight to /verify -- see razorpayCheckout.ts and
  // payments.routes.ts for what's actually trusted at each step.
  const payOnlineMutation = useMutation({
    mutationFn: async () => {
      const order = await createBillPaymentOrder(billType, billId);
      const result = await openRazorpayCheckout({
        order,
        clinicName: clinic?.name ?? 'OPD Care',
        description: BILL_TYPE_LABEL[billType],
        prefill: { name: user?.name, email: user?.email, contact: user?.phone ?? undefined },
      });
      return verifyBillPayment(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setError(null);
    },
    onError: (err: any) => setError(err.response?.data?.message ?? err.message ?? 'Payment could not be completed'),
  });

  if (!data || data.total <= 0) return null;

  const isPaid = data.balanceDue <= 0.01;

  return (
    <div className="mt-2 rounded-md bg-gray-50 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-gray-500">
          Total ₹{data.total.toFixed(2)} · Paid ₹{data.amountPaid.toFixed(2)}
        </span>
        <span className={isPaid ? 'font-medium text-teal' : 'font-medium text-gold'}>
          {isPaid ? 'Paid in full' : `Balance ₹${data.balanceDue.toFixed(2)}`}
        </span>
      </div>
      {!isPaid && isPatient && (
        <div className="mt-2">
          {razorpayStatus?.billPayments ? (
            <button
              onClick={() => payOnlineMutation.mutate()}
              disabled={payOnlineMutation.isPending}
              className="rounded-md bg-teal px-3 py-1.5 text-sm text-white hover:bg-teal-mid disabled:opacity-60"
            >
              {payOnlineMutation.isPending ? 'Opening payment…' : `Pay ₹${data.balanceDue.toFixed(2)} Online`}
            </button>
          ) : (
            <p className="text-xs text-gray-500">Please pay this bill at the clinic counter.</p>
          )}
        </div>
      )}
      {!isPaid && !isPatient && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            type="number"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            onClick={() => mutation.mutate()}
            disabled={!amount || mutation.isPending}
            className="rounded-md bg-teal px-3 py-1.5 text-sm text-white hover:bg-teal-mid disabled:opacity-60"
          >
            {mutation.isPending ? 'Recording…' : 'Record Payment'}
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {data.payments.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-gray-500">
          {data.payments.map((p) => (
            <li key={p.id}>
              ₹{p.amount.toFixed(2)} via {p.method} — {new Date(p.createdAt).toLocaleString()}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
