import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchMySubscription } from '../api/clinics';
import { createSubscriptionPaymentOrder, getRazorpayStatus, verifySubscriptionPayment } from '../api/payments';
import { openRazorpayCheckout } from '../utils/razorpayCheckout';
import { useAuth } from '../context/AuthContext';
import type { ClinicTier, Subscription } from '@opd/shared';
import { useState } from 'react';

const TIER_LABEL: Record<ClinicTier, string> = {
  1: 'Tier 1 — OPD',
  2: 'Tier 2 — +Pharmacy/Lab/Radiology',
  3: 'Tier 3 — +IPD',
};

// Mirrors the platform dashboard's status derivation -- "Lapsed" is its own
// state (currentPeriodEnd has passed but nobody has suspended it) distinct
// from an admin-suspended clinic, though both currently block access.
function statusLabel(sub: Subscription): { text: string; className: string } {
  if (sub.status === 'SUSPENDED') return { text: 'Suspended', className: 'bg-red-100 text-red-700' };
  if (sub.status === 'CANCELLED') return { text: 'Cancelled', className: 'bg-gray-200 text-gray-600' };
  if (!sub.isActive) return { text: 'Lapsed', className: 'bg-amber-100 text-amber-700' };
  return { text: 'Active', className: 'bg-green-100 text-green-700' };
}

export function SubscriptionBillingPage() {
  const { clinic } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const { data: subscription, isLoading } = useQuery({ queryKey: ['my-subscription'], queryFn: fetchMySubscription });
  const { data: razorpayStatus } = useQuery({ queryKey: ['razorpay-status'], queryFn: getRazorpayStatus, staleTime: 5 * 60 * 1000 });

  const renewMutation = useMutation({
    mutationFn: async () => {
      const order = await createSubscriptionPaymentOrder();
      const result = await openRazorpayCheckout({
        order,
        clinicName: clinic?.name ?? 'OPD Care',
        description: 'Subscription renewal',
        prefill: { name: clinic?.name },
      });
      return verifySubscriptionPayment(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-subscription'] });
      setError(null);
    },
    onError: (err: any) => setError(err.response?.data?.message ?? err.message ?? 'Renewal could not be completed'),
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-teal">Subscription &amp; Billing</h1>

      {isLoading && <p className="text-gray-500">Loading…</p>}

      {subscription && (
        <div className="rounded-lg border border-teal-light bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-gray-800">{TIER_LABEL[subscription.tier]}</p>
              <p className="text-sm text-gray-500">
                {subscription.billingCycle === 'MONTHLY' ? 'Billed monthly' : 'Billed annually'} · ₹{subscription.amount.toFixed(2)}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusLabel(subscription).className}`}>
              {statusLabel(subscription).text}
            </span>
          </div>
          <p className="text-sm text-gray-600">
            {subscription.isActive ? 'Current period ends' : 'Period ended'} on{' '}
            <span className="font-medium">{new Date(subscription.currentPeriodEnd).toLocaleDateString()}</span>
          </p>

          <div className="mt-5">
            {razorpayStatus?.configured ? (
              <button
                onClick={() => renewMutation.mutate()}
                disabled={renewMutation.isPending}
                className="rounded-md bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-mid disabled:opacity-60"
              >
                {renewMutation.isPending ? 'Opening payment…' : `Renew Now — ₹${subscription.amount.toFixed(2)}`}
              </button>
            ) : (
              <p className="text-sm text-gray-500">
                Online renewal isn't set up yet — please contact the platform to renew this subscription.
              </p>
            )}
            <p className="mt-2 text-xs text-gray-400">
              Renewing at your current tier and billing cycle. To change tier or billing cycle, contact the platform.
            </p>
          </div>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
