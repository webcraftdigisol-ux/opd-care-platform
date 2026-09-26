import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listClinicsWithSubscriptions,
  reactivateSubscription,
  extendSubscription,
  renewSubscription,
  suspendSubscription,
} from '../api/platform';
import type { ClinicTier, ClinicWithSubscription } from '@opd/shared';

const TIER_LABEL: Record<ClinicTier, string> = {
  1: 'Tier 1 — OPD',
  2: 'Tier 2 — +Pharmacy/Lab/Radiology',
  3: 'Tier 3 — +IPD',
};

// Not stored -- derived the same way the server's isSubscriptionActive()
// does, just for display: ACTIVE-but-past-its-date is a distinct state
// ("lapsed") from a platform admin manually SUSPENDED-ing a clinic, even
// though both block access identically.
function statusLabel(sub: ClinicWithSubscription['subscription']): { text: string; className: string } {
  if (sub.status === 'SUSPENDED') return { text: 'Suspended', className: 'bg-red-100 text-red-700' };
  if (sub.status === 'CANCELLED') return { text: 'Cancelled', className: 'bg-gray-200 text-gray-600' };
  if (!sub.isActive) return { text: 'Lapsed', className: 'bg-amber-100 text-amber-700' };
  return { text: 'Active', className: 'bg-green-100 text-green-700' };
}

function RenewForm({ clinic, onClose }: { clinic: ClinicWithSubscription; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [tier, setTier] = useState<ClinicTier>(clinic.subscription.tier);
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>(clinic.subscription.billingCycle);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      renewSubscription(clinic.id, {
        tier,
        billingCycle,
        amount: amount ? Number(amount) : undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-clinics'] });
      onClose();
    },
  });

  return (
    <tr className="border-t border-gray-100 bg-gray-50">
      <td colSpan={6} className="px-4 py-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <select
            value={tier}
            onChange={(e) => setTier(Number(e.target.value) as ClinicTier)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            {([1, 2, 3] as ClinicTier[]).map((t) => (
              <option key={t} value={t}>
                {TIER_LABEL[t]}
              </option>
            ))}
          </select>
          <select
            value={billingCycle}
            onChange={(e) => setBillingCycle(e.target.value as 'MONTHLY' | 'ANNUAL')}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="MONTHLY">Monthly</option>
            <option value="ANNUAL">Annual</option>
          </select>
          <input
            type="number"
            step="0.01"
            placeholder="Amount (default price if blank)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
          <input
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        {mutation.isError && (
          <p className="mt-2 text-xs text-red-600">{(mutation.error as any)?.response?.data?.message ?? 'Could not record renewal'}</p>
        )}
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="rounded-md bg-gray-800 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-60"
          >
            {mutation.isPending ? 'Recording…' : 'Record payment & renew'}
          </button>
          <button onClick={onClose} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

function ExtendForm({ clinic, onClose }: { clinic: ClinicWithSubscription; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [days, setDays] = useState('30');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => extendSubscription(clinic.id, { days: Number(days), reason: reason.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-clinics'] });
      onClose();
    },
  });

  const from = Math.max(new Date(clinic.subscription.currentPeriodEnd).getTime(), Date.now());
  const daysNum = Number(days);
  const newEnd = daysNum > 0 ? new Date(from + daysNum * 24 * 60 * 60 * 1000) : null;

  return (
    <tr className="border-t border-gray-100 bg-gray-50">
      <td colSpan={6} className="px-4 py-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <input
            type="number"
            min={1}
            max={365}
            data-testid="extend-days"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
          <input
            placeholder="Reason (e.g. trial extension)"
            data-testid="extend-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm sm:col-span-3"
          />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          No payment is recorded.{newEnd ? ` New end date: ${newEnd.toLocaleDateString()}.` : ''}
        </p>
        {mutation.isError && (
          <p className="mt-2 text-xs text-red-600">{(mutation.error as any)?.response?.data?.message ?? 'Could not extend'}</p>
        )}
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !(daysNum >= 1 && daysNum <= 365) || reason.trim().length < 3}
            className="rounded-md bg-gray-800 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-60"
          >
            {mutation.isPending ? 'Extending…' : `Extend by ${daysNum > 0 ? daysNum : '…'} days`}
          </button>
          <button onClick={onClose} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

export function PlatformDashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [openForm, setOpenForm] = useState<{ clinicId: string; kind: 'renew' | 'extend' } | null>(null);
  const adminRaw = localStorage.getItem('opd_platform_admin');
  const admin = adminRaw ? (JSON.parse(adminRaw) as { name: string; email: string }) : null;

  const { data: clinics, isLoading } = useQuery({
    queryKey: ['platform-clinics'],
    queryFn: listClinicsWithSubscriptions,
  });

  const suspendMutation = useMutation({
    mutationFn: (clinicId: string) => suspendSubscription(clinicId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-clinics'] }),
  });
  const reactivateMutation = useMutation({
    mutationFn: (clinicId: string) => reactivateSubscription(clinicId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['platform-clinics'] }),
  });

  function handleLogout() {
    localStorage.removeItem('opd_platform_token');
    localStorage.removeItem('opd_platform_admin');
    navigate('/platform/login');
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Clinics &amp; Subscriptions</h1>
          {admin && <p className="text-sm text-gray-500">Signed in as {admin.name}</p>}
        </div>
        <button
          onClick={handleLogout}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
        >
          Log out
        </button>
      </div>

      {isLoading && <p className="text-gray-500">Loading…</p>}
      {reactivateMutation.isError && (
        <p className="mb-3 text-sm text-red-600">
          {(reactivateMutation.error as any)?.response?.data?.message ?? 'Could not reactivate'}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-2">Clinic</th>
              <th className="px-4 py-2">Tier</th>
              <th className="px-4 py-2">Billing</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Renews / Renewed</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {clinics?.map((clinic) => {
              const status = statusLabel(clinic.subscription);
              const isRenewing = openForm?.clinicId === clinic.id && openForm.kind === 'renew';
              const isExtending = openForm?.clinicId === clinic.id && openForm.kind === 'extend';
              return (
                <Fragment key={clinic.id}>
                  <tr className="border-t border-gray-100">
                    <td className="px-4 py-2">
                      <p className="font-medium">{clinic.name}</p>
                      <p className="text-xs text-gray-400">{clinic.slug}</p>
                    </td>
                    <td className="px-4 py-2 text-gray-600">{TIER_LABEL[clinic.subscription.tier]}</td>
                    <td className="px-4 py-2 text-gray-600">
                      {clinic.subscription.billingCycle === 'MONTHLY' ? 'Monthly' : 'Annual'} · ₹
                      {clinic.subscription.amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>{status.text}</span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {new Date(clinic.subscription.currentPeriodEnd).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setOpenForm(isRenewing ? null : { clinicId: clinic.id, kind: 'renew' })}
                          className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                        >
                          Renew
                        </button>
                        <button
                          onClick={() => setOpenForm(isExtending ? null : { clinicId: clinic.id, kind: 'extend' })}
                          className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                        >
                          Extend
                        </button>
                        {clinic.subscription.status === 'SUSPENDED' || clinic.subscription.status === 'CANCELLED' ? (
                          <button
                            onClick={() => reactivateMutation.mutate(clinic.id)}
                            disabled={reactivateMutation.isPending}
                            className="rounded-md border border-green-300 px-2 py-1 text-xs text-green-700 hover:bg-green-50 disabled:opacity-60"
                          >
                            Reactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => suspendMutation.mutate(clinic.id)}
                            disabled={suspendMutation.isPending}
                            className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                          >
                            Suspend
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isRenewing && <RenewForm clinic={clinic} onClose={() => setOpenForm(null)} />}
                  {isExtending && <ExtendForm clinic={clinic} onClose={() => setOpenForm(null)} />}
                </Fragment>
              );
            })}
            {clinics?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  No clinics yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
