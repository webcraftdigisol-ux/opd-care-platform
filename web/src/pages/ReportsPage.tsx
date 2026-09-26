import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getDailyActivityReport,
  getFollowUpsReport,
  markFollowUpContacted,
  sendFollowUpReminder,
} from '../api/reports';
import { useAuth } from '../context/AuthContext';
import { RevenueReport, cell, download } from '../components/RevenueReport';
import { OrdersReport } from '../components/OrdersReport';
import { PageHeader, btnSecondary } from '../components/ui';
import type { Department, FollowUpItem, FollowUpReminderResult, Notification, Role } from '@opd/shared';

type Tab = 'revenue' | 'orders' | 'activity' | 'follow-ups';

// A department counter's reports cover only its own department.
const DEPARTMENT_OF: Partial<Record<Role, Department>> = {
  PHARMACIST: 'PHARMACY',
  LAB_TECHNICIAN: 'LAB',
  RADIOLOGY_TECHNICIAN: 'RADIOLOGY',
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
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
          <button
            type="button"
            className={`${btnSecondary} mb-4`}
            onClick={() =>
              download(
                `daily_activity_${date}.csv`,
                [
                  ['Doctor', 'Appointments', 'Completed'],
                  ...data.byDoctor.map((d) => [d.doctorName, d.total, d.completed]),
                  ['All doctors', data.totalAppointments, data.completed],
                ]
                  .map((r) => r.map(cell).join(','))
                  .join('\r\n'),
              )
            }
          >
            Export CSV
          </button>
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
  const { clinic, user } = useAuth();
  const [tab, setTab] = useState<Tab>('revenue');
  const own = user ? DEPARTMENT_OF[user.role] : undefined;
  const tier2 = (clinic?.tier ?? 1) >= 2;

  const tabs: { key: Tab; label: string }[] = own
    ? [
        { key: 'revenue', label: 'Revenue' },
        { key: 'orders', label: 'Ordered vs done' },
      ]
    : [
        { key: 'revenue', label: 'Revenue' },
        // What was ordered vs done in-house needs the Tier 2 departments.
        ...(tier2 ? [{ key: 'orders' as const, label: 'Prescribed vs in-house' }] : []),
        { key: 'activity', label: 'Daily Activity' },
        { key: 'follow-ups', label: 'Follow-ups Due' },
      ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Reports"
        subtitle={own ? 'Your department’s revenue, and what doctors ordered vs what was done here.' : 'Revenue, orders done in-house, activity and follow-ups.'}
      />
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-gray-200" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium ${
              tab === t.key ? 'border-teal text-teal' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'revenue' && <RevenueReport lockTo={own} />}
      {tab === 'orders' && <OrdersReport lockTo={own} />}
      {tab === 'activity' && <ActivityTab />}
      {tab === 'follow-ups' && <FollowUpsTab />}
    </div>
  );
}
