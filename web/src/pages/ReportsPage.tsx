import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getDailyActivityReport,
  getFinancialReport,
  getFollowUpsReport,
  markFollowUpContacted,
  sendFollowUpReminder,
} from '../api/reports';
import type { FollowUpItem, FollowUpReminderResult, Notification, RevenueSection } from '@opd/shared';

type Tab = 'financial' | 'activity' | 'follow-ups';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function RevenueSectionCard({ title, section }: { title: string; section: RevenueSection }) {
  return (
    <div className="rounded-xl bg-white p-6 shadow-sm">
      <h3 className="mb-4 font-semibold text-gray-700">{title}</h3>
      <div className="mb-4 grid grid-cols-2 gap-4">
        <div className="rounded-lg bg-teal-light p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal">Actual</p>
          <p className="text-2xl font-bold text-teal">₹{section.actual.total.toFixed(2)}</p>
          <p className="text-xs text-gray-500">{section.actual.count} line items billed</p>
        </div>
        <div className="rounded-lg bg-gold-light p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gold">Total Ordered</p>
          <p className="text-2xl font-bold text-gold">₹{section.totalOrdered.total.toFixed(2)}</p>
          <p className="text-xs text-gray-500">
            {section.totalOrdered.count} ordered
            {section.totalOrdered.unmatchedCount > 0 && (
              <> · {section.totalOrdered.unmatchedCount} unmatched to catalog</>
            )}
          </p>
        </div>
      </div>
      {section.byItem.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-gray-500">
              <tr className="border-b border-gray-200">
                <th className="py-1">Item</th>
                <th className="py-1 text-right">Actual Qty</th>
                <th className="py-1 text-right">Actual ₹</th>
                <th className="py-1 text-right">Ordered Qty</th>
                <th className="py-1 text-right">Ordered ₹</th>
              </tr>
            </thead>
            <tbody>
              {section.byItem.map((item) => (
                <tr key={item.name} className="border-b border-gray-100">
                  <td className="py-1">
                    {item.name}
                    {item.unmatchedOrderedCount > 0 && (
                      <span className="ml-1 text-xs text-red-500">({item.unmatchedOrderedCount} unmatched)</span>
                    )}
                  </td>
                  <td className="py-1 text-right">{item.actualQuantity}</td>
                  <td className="py-1 text-right">₹{item.actualTotal.toFixed(2)}</td>
                  <td className="py-1 text-right">{item.orderedQuantity}</td>
                  <td className="py-1 text-right">₹{item.orderedTotal.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {section.byItem.length === 0 && <p className="text-sm text-gray-400">No activity in this range.</p>}
    </div>
  );
}

function FinancialTab() {
  const [from, setFrom] = useState(daysAgoIso(29));
  const [to, setTo] = useState(todayIso());
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['report-financial', from, to],
    queryFn: () => getFinancialReport(from, to),
    retry: false,
  });

  if (isError) {
    const message = (error as any)?.response?.data?.message ?? 'Could not load the financial report.';
    return <p className="text-sm text-gray-500">{message}</p>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2"
          />
        </div>
      </div>
      {isLoading && <p className="text-gray-500">Loading…</p>}
      {data && (
        <div className="space-y-6">
          <RevenueSectionCard title="Pharmacy" section={data.pharmacy} />
          <RevenueSectionCard title="Lab" section={data.lab} />
          <RevenueSectionCard title="Radiology" section={data.radiology} />
        </div>
      )}
    </div>
  );
}

function ActivityTab() {
  const [date, setDate] = useState(todayIso());
  const { data, isLoading } = useQuery({
    queryKey: ['report-daily-activity', date],
    queryFn: () => getDailyActivityReport(date),
  });

  return (
    <div>
      <div className="mb-4">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2"
        />
      </div>
      {isLoading && <p className="text-gray-500">Loading…</p>}
      {data && (
        <div>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Total', data.totalAppointments],
              ['Walk-ins', data.walkIns],
              ['Completed', data.completed],
              ['Cancelled / No-show', data.cancelled + data.noShow],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-white p-4 text-center shadow-sm">
                <p className="text-2xl font-bold text-teal">{value}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-teal-light text-teal">
                <tr>
                  <th className="px-4 py-2">Doctor</th>
                  <th className="px-4 py-2">Appointments</th>
                  <th className="px-4 py-2">Completed</th>
                </tr>
              </thead>
              <tbody>
                {data.byDoctor.map((d) => (
                  <tr key={d.doctorId} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium">{d.doctorName}</td>
                    <td className="px-4 py-2">{d.total}</td>
                    <td className="px-4 py-2">{d.completed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function channelOutcome(label: string, n: Notification): string {
  if (n.status === 'SENT') return `${label}: sent`;
  if (n.status === 'FAILED') return `${label}: failed`;
  return `${label}: not sent${n.error ? ` — ${n.error.toLowerCase()}` : ''}`;
}

function FollowUpGroup({
  title,
  items,
  urgent,
  onContact,
  onRemind,
  remindingId,
  results,
}: {
  title: string;
  items: FollowUpItem[];
  urgent?: boolean;
  onContact: (id: string) => void;
  onRemind: (id: string) => void;
  remindingId: string | null;
  results: Record<string, FollowUpReminderResult>;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mb-6">
      <h3 className={`mb-2 text-sm font-semibold uppercase tracking-wide ${urgent ? 'text-red-500' : 'text-gray-500'}`}>
        {title} ({items.length})
      </h3>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.consultationId}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3"
          >
            <div>
              <p className="font-medium">{item.patientName}</p>
              <p className="text-sm text-gray-500">
                {item.patientPhone ?? 'No phone'} · Dr. {item.doctorName} · Follow-up {item.followUpDate}
              </p>
              {results[item.consultationId] && (
                <p className="mt-1 text-xs text-gray-500" data-testid="reminder-outcome">
                  {channelOutcome('WhatsApp', results[item.consultationId].whatsapp)} ·{' '}
                  {channelOutcome('Email', results[item.consultationId].email)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => onRemind(item.consultationId)}
                disabled={remindingId === item.consultationId}
                className="text-sm text-teal hover:underline disabled:opacity-60"
              >
                {remindingId === item.consultationId ? 'Sending…' : 'Send reminder'}
              </button>
              <button onClick={() => onContact(item.consultationId)} className="text-sm text-teal hover:underline">
                Mark contacted
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FollowUpsTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['report-follow-ups'], queryFn: getFollowUpsReport });

  const contactMutation = useMutation({
    mutationFn: markFollowUpContacted,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['report-follow-ups'] }),
  });

  const [results, setResults] = useState<Record<string, FollowUpReminderResult>>({});
  const remindMutation = useMutation({
    mutationFn: sendFollowUpReminder,
    onSuccess: (result, consultationId) => setResults((r) => ({ ...r, [consultationId]: result })),
  });

  if (isLoading) return <p className="text-gray-500">Loading…</p>;
  if (!data) return null;

  const hasNothing = data.overdue.length === 0 && data.dueToday.length === 0 && data.dueThisWeek.length === 0;
  const remindingId = remindMutation.isPending ? (remindMutation.variables as string) : null;

  return (
    <div>
      {hasNothing && <p className="text-gray-500">No follow-ups due in the next 7 days.</p>}
      <FollowUpGroup
        title="Overdue"
        items={data.overdue}
        urgent
        onContact={contactMutation.mutate}
        onRemind={remindMutation.mutate}
        remindingId={remindingId}
        results={results}
      />
      <FollowUpGroup
        title="Due Today"
        items={data.dueToday}
        urgent
        onContact={contactMutation.mutate}
        onRemind={remindMutation.mutate}
        remindingId={remindingId}
        results={results}
      />
      <FollowUpGroup
        title="Due This Week"
        items={data.dueThisWeek}
        onContact={contactMutation.mutate}
        onRemind={remindMutation.mutate}
        remindingId={remindingId}
        results={results}
      />
    </div>
  );
}

export function ReportsPage() {
  const [tab, setTab] = useState<Tab>('financial');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'financial', label: 'Financial' },
    { key: 'activity', label: 'Daily Activity' },
    { key: 'follow-ups', label: 'Follow-ups Due' },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-teal">Reports</h1>
      <div className="mb-6 flex gap-2 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t.key ? 'border-b-2 border-teal text-teal' : 'text-gray-500 hover:text-teal'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'financial' && <FinancialTab />}
      {tab === 'activity' && <ActivityTab />}
      {tab === 'follow-ups' && <FollowUpsTab />}
    </div>
  );
}
