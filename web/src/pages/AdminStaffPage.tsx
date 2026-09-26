import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PublicUser, StaffRole } from '@opd/shared';
import { createStaff, listStaff, resetStaffPassword, updateStaff } from '../api/admin';
import { useAuth } from '../context/AuthContext';
import { Card, Field, Modal, PageHeader, btnPrimary, btnSecondary, inputClass } from '../components/ui';
import { Icon } from '../components/Icon';
import { ROLE_LABELS } from '../utils/navLinks';

const STAFF_ROLES: StaffRole[] = ['RECEPTIONIST', 'NURSE', 'HEAD_NURSE', 'PHARMACIST', 'LAB_TECHNICIAN', 'RADIOLOGY_TECHNICIAN', 'ADMIN'];

// Who can sign in, and what they can open: add an account (username and/or
// email), change a role, reset a forgotten password, or switch an account
// off without losing its history.
export function AdminStaffPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: staff, isLoading } = useQuery({ queryKey: ['staff'], queryFn: listStaff });
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<PublicUser | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['staff'] });

  const update = useMutation({
    mutationFn: ({ id, ...data }: { id: string; role?: StaffRole; active?: boolean }) => updateStaff(id, data),
    onSuccess: (u, vars) => {
      refresh();
      setMessage({
        ok: true,
        text: vars.active === false ? `${u.name} can no longer sign in.` : vars.active ? `${u.name} can sign in again.` : `${u.name} is now ${ROLE_LABELS[u.role]}.`,
      });
    },
    onError: (err: any) => setMessage({ ok: false, text: err.response?.data?.message ?? 'Could not update the account' }),
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Staff accounts"
        subtitle="Manage who can sign in and what they can access."
        actions={
          <button type="button" onClick={() => setAdding((a) => !a)} className={adding ? btnSecondary : btnPrimary} data-testid="add-staff">
            {adding ? (
              'Close'
            ) : (
              <>
                <Icon name="plus" className="h-4 w-4" /> Add staff account
              </>
            )}
          </button>
        }
      />
      {adding && (
        <AddStaffForm
          onDone={(u) => {
            setAdding(false);
            refresh();
            setMessage({ ok: true, text: `${u.name} can now sign in${u.username ? ` as “${u.username}”` : ''}.` });
          }}
        />
      )}
      {message && <p className={`mb-4 rounded-lg p-3 text-sm ${message.ok ? 'bg-teal-light text-teal' : 'bg-red-50 text-red-700'}`}>{message.text}</p>}

      <Card>
        {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
        <ul className="divide-y divide-gray-100" data-testid="staff-list">
          {staff?.map((s) => {
            const isSelf = s.id === user?.id;
            const isDoctor = s.role === 'DOCTOR';
            return (
              <li key={s.id} className={`flex flex-wrap items-center gap-3 py-3 ${s.active === false ? 'opacity-60' : ''}`} data-testid="staff-row">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-light text-teal">
                  <Icon name={isDoctor ? 'doctor' : 'shield'} className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-gray-900">
                    {s.name}
                    {isSelf && <span className="ml-2 text-xs font-normal text-gray-400">(you)</span>}
                    {s.active === false && <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-normal text-gray-600">Deactivated</span>}
                  </span>
                  <span className="block truncate text-xs text-gray-500">
                    {[s.username && `@${s.username}`, !s.email.endsWith('@opd.local') && s.email, s.phone].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {isDoctor || isSelf ? (
                  <span className="text-sm text-gray-600">{ROLE_LABELS[s.role]}</span>
                ) : (
                  <select
                    value={s.role}
                    onChange={(e) => update.mutate({ id: s.id, role: e.target.value as StaffRole })}
                    className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                    aria-label={`Role for ${s.name}`}
                  >
                    {STAFF_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                )}
                <span className="flex gap-3 text-sm">
                  <button type="button" onClick={() => setResetting(s)} className="text-teal hover:underline">
                    Reset password
                  </button>
                  {!isSelf &&
                    (s.active === false ? (
                      <button type="button" onClick={() => update.mutate({ id: s.id, active: true })} className="text-teal hover:underline">
                        Reactivate
                      </button>
                    ) : (
                      <button type="button" onClick={() => update.mutate({ id: s.id, active: false })} className="text-red-600 hover:underline">
                        Deactivate
                      </button>
                    ))}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-xs text-gray-500">
          Doctors are added on the{' '}
          <Link to="/admin/doctors" className="text-teal underline">
            Doctors
          </Link>{' '}
          page, which also sets their fee and schedule.
        </p>
      </Card>

      {resetting && (
        <ResetPasswordDialog
          staff={resetting}
          onClose={() => setResetting(null)}
          onDone={(text) => {
            setResetting(null);
            setMessage({ ok: true, text });
          }}
        />
      )}
    </div>
  );
}

function AddStaffForm({ onDone }: { onDone: (u: PublicUser) => void }) {
  const [form, setForm] = useState({ name: '', role: 'RECEPTIONIST' as StaffRole, username: '', email: '', phone: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () =>
      createStaff({
        name: form.name,
        role: form.role,
        password: form.password,
        username: form.username || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
      }),
    onSuccess: onDone,
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not create the account'),
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Card title="New staff account" className="mb-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          create.mutate();
        }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field label="Full name" required>
          <input required value={form.name} onChange={set('name')} className={inputClass} data-testid="staff-name" />
        </Field>
        <Field label="Role" required>
          <select value={form.role} onChange={set('role')} className={inputClass} data-testid="staff-role">
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Username" hint="Lowercase, no spaces — what they type to sign in">
          <input
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))}
            className={inputClass}
            autoCapitalize="none"
            data-testid="staff-username"
          />
        </Field>
        <Field label="Temporary password" required hint="At least 6 characters">
          <input required minLength={6} value={form.password} onChange={set('password')} className={inputClass} data-testid="staff-password" />
        </Field>
        <Field label="Email" hint="Optional if a username is set">
          <input type="email" value={form.email} onChange={set('email')} className={inputClass} />
        </Field>
        <Field label="Mobile">
          <input type="tel" value={form.phone} onChange={set('phone')} className={inputClass} />
        </Field>
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">{error}</p>}
        <div className="sm:col-span-2">
          <button type="submit" disabled={create.isPending || (!form.username && !form.email)} className={btnPrimary} data-testid="create-staff">
            Create account
          </button>
        </div>
      </form>
    </Card>
  );
}

function ResetPasswordDialog({ staff, onClose, onDone }: { staff: PublicUser; onClose: () => void; onDone: (text: string) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const reset = useMutation({
    mutationFn: () => resetStaffPassword(staff.id, password),
    onSuccess: (r) => onDone(`${r.message}. Share the new password with them.`),
    onError: (err: any) => setError(err.response?.data?.message ?? 'Could not reset the password'),
  });
  return (
    <Modal title={`Reset password for ${staff.name}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          reset.mutate();
        }}
      >
        <Field label="New temporary password" hint="At least 6 characters">
          <input autoFocus required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} data-testid="new-password" />
        </Field>
        {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" disabled={reset.isPending} className={btnPrimary} data-testid="confirm-reset">
            Reset password
          </button>
        </div>
      </form>
    </Modal>
  );
}
