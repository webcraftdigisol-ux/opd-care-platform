import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import type { MedicineSystem } from '@opd/shared';
import { updateCurrentClinic } from '../api/clinics';
import { MEDICINE_SYSTEMS } from '../utils/medicineSystem';
import { useAuth } from '../context/AuthContext';
import { Card, Field, PageHeader, btnPrimary, inputClass } from '../components/ui';

// The clinic's own details: they head every printed visit summary.
export function ClinicSettingsPage() {
  const { clinic, user, setSession } = useAuth();
  const [form, setForm] = useState<{ name: string; address: string; phone: string; medicineSystem: MedicineSystem }>({ name: '', address: '', phone: '', medicineSystem: 'ALLOPATHIC' });
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (clinic) setForm({ name: clinic.name, address: clinic.address ?? '', phone: clinic.phone ?? '', medicineSystem: clinic.medicineSystem ?? 'ALLOPATHIC' });
  }, [clinic]);

  const save = useMutation({
    mutationFn: () => updateCurrentClinic(form),
    onSuccess: (updated) => {
      // Keep the sidebar and letterhead in step without a re-login.
      const token = localStorage.getItem('opd_token');
      if (token && user) setSession(token, user, updated);
      setStatus({ ok: true, text: 'Saved.' });
    },
    onError: (err: any) => setStatus({ ok: false, text: err.response?.data?.message ?? 'Could not save' }),
  });

  const set = (key: 'name' | 'address' | 'phone') => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <PageHeader title="Clinic settings" subtitle="These details print at the top of every visit summary." />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Card title="Letterhead">
          <div className="space-y-4">
            <Field label="Clinic name" required>
              <input required value={form.name} onChange={set('name')} className={inputClass} />
            </Field>
            <Field label="Address">
              <textarea rows={2} value={form.address} onChange={set('address')} className={inputClass} data-testid="clinic-address" />
            </Field>
            <Field label="Phone">
              <input value={form.phone} onChange={set('phone')} className={inputClass} data-testid="clinic-phone" />
            </Field>
            <Field label="Type of clinic / hospital" hint="Decides which standard medicine list “Load standard list” adds">
              <select
                value={form.medicineSystem}
                onChange={(e) => setForm((f) => ({ ...f, medicineSystem: e.target.value as MedicineSystem }))}
                className={inputClass}
                data-testid="clinic-medicine-system"
              >
                {MEDICINE_SYSTEMS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            <p className="text-sm text-gray-500">
              Each doctor's qualification and registration number are set on the{' '}
              <Link to="/admin/doctors" className="text-teal underline">
                Doctors
              </Link>{' '}
              page.
            </p>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <button type="submit" disabled={save.isPending} className={btnPrimary}>
              Save
            </button>
            {status && <span className={`text-sm ${status.ok ? 'text-teal' : 'text-red-600'}`}>{status.text}</span>}
          </div>
        </Card>
      </form>
    </div>
  );
}
