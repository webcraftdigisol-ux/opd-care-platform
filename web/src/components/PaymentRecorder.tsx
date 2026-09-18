import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getBillPayments, recordPayment } from '../api/payments';
import type { BillType, PaymentMethod } from '@opd/shared';

const METHODS: PaymentMethod[] = ['CASH', 'CARD', 'UPI', 'NETBANKING', 'WALLET'];

export function PaymentRecorder({ billType, billId }: { billType: BillType; billId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ['bill-payments', billType, billId];
  const { data } = useQuery({ queryKey, queryFn: () => getBillPayments(billType, billId) });
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => recordPayment({ billType, billId, amount: Number(amount), method }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setAmount('');
      setError(null);
    },
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not record payment'),
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
      {!isPaid && (
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
