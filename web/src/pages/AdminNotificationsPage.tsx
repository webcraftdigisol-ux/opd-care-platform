import { useQuery } from '@tanstack/react-query';
import { listNotifications } from '../api/admin';
import type { NotificationStatus } from '@opd/shared';

const STATUS_STYLES: Record<NotificationStatus, string> = {
  SENT: 'border-teal-mid bg-teal-light text-teal',
  FAILED: 'border-red-300 bg-red-50 text-red-600',
  SKIPPED: 'border-gray-300 bg-gray-100 text-gray-500',
};

export function AdminNotificationsPage() {
  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => listNotifications(),
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-teal">Notifications</h1>
      <p className="mb-6 text-sm text-gray-500">
        Every appointment confirmation, payment receipt, discharge summary, and follow-up reminder this clinic has
        attempted to send, whether or not it actually went out (SKIPPED means no email provider is configured for
        this deployment yet, or the patient has no usable email on file).
      </p>

      {isLoading && <p className="text-gray-500">Loading…</p>}
      {!isLoading && notifications?.length === 0 && <p className="text-gray-500">No notifications yet.</p>}

      <div className="space-y-2">
        {notifications?.map((n) => (
          <div key={n.id} className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">
                {n.type.replace(/_/g, ' ')} {n.patientName && <span className="font-normal text-gray-500">· {n.patientName}</span>}
              </p>
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[n.status]}`}>
                {n.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-600">{n.subject}</p>
            <p className="text-xs text-gray-400">
              To: {n.recipient} · {new Date(n.createdAt).toLocaleString()}
            </p>
            {n.error && <p className="mt-1 text-xs text-gray-400">{n.error}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
