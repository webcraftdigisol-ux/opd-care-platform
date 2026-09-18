import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerClinic } from '../api/clinics';
import { useAuth } from '../context/AuthContext';

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function RegisterClinicPage() {
  const [clinicName, setClinicName] = useState('');
  const [clinicSlug, setClinicSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [tier, setTier] = useState<1 | 2>(1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { setSession } = useAuth();
  const navigate = useNavigate();

  function handleClinicNameChange(value: string) {
    setClinicName(value);
    if (!slugEdited) setClinicSlug(slugify(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { token, user, clinic } = await registerClinic({
        clinicName,
        clinicSlug,
        adminName,
        adminEmail,
        adminPassword,
        tier,
      });
      setSession(token, user, clinic);
      navigate('/admin');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Could not register clinic');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto mt-12 max-w-md rounded-xl bg-white p-8 shadow-md">
      <h1 className="mb-1 text-2xl font-semibold text-teal">Register your clinic</h1>
      <p className="mb-6 text-sm text-gray-500">
        Sets up a new clinic workspace and its first admin account.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Clinic name</label>
          <input
            required
            value={clinicName}
            onChange={(e) => handleClinicNameChange(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-teal focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Clinic code (used to sign in)</label>
          <input
            required
            value={clinicSlug}
            onChange={(e) => {
              setSlugEdited(true);
              setClinicSlug(slugify(e.target.value));
            }}
            className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono focus:border-teal focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Plan</label>
          <select
            value={tier}
            onChange={(e) => setTier(Number(e.target.value) as 1 | 2)}
            className="w-full rounded-md border border-gray-300 px-3 py-2"
          >
            <option value={1}>Tier 1 — OPD only</option>
            <option value={2}>Tier 2 — OPD + Pharmacy + Lab</option>
          </select>
        </div>
        <hr className="border-gray-200" />
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Your name (clinic admin)</label>
          <input
            required
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-teal focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Your email</label>
          <input
            type="email"
            required
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-teal focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Password</label>
          <input
            type="password"
            required
            minLength={6}
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-teal focus:outline-none"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-teal py-2 font-medium text-white hover:bg-teal-mid disabled:opacity-60"
        >
          {submitting ? 'Setting up…' : 'Create clinic'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-gray-500">
        Already have a clinic?{' '}
        <Link to="/login" className="text-teal underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
