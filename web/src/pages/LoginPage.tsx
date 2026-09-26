import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SUBSCRIPTION_INACTIVE_MESSAGE } from '@opd/shared';
import { useQuery } from '@tanstack/react-query';
import { getPasswordResetStatus, login } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { homeRouteForRole } from '../utils/roleHome';

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const [clinicSlug, setClinicSlug] = useState(searchParams.get('clinic') ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    searchParams.get('locked') === '1' ? SUBSCRIPTION_INACTIVE_MESSAGE : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const { setSession } = useAuth();
  // "Forgot password?" only when a code can actually be delivered.
  const { data: resetStatus } = useQuery({ queryKey: ['password-reset-status'], queryFn: getPasswordResetStatus });
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { token, user, clinic } = await login({ clinicSlug: clinicSlug.trim(), email, password });
      setSession(token, user, clinic);
      navigate(homeRouteForRole(user.role));
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  const isLockout = error === SUBSCRIPTION_INACTIVE_MESSAGE;

  return (
    <div className="mx-auto mt-20 max-w-sm rounded-xl bg-white p-8 shadow-md">
      <h1 className="mb-1 text-2xl font-semibold text-teal">Welcome back</h1>
      <p className="mb-6 text-sm text-gray-500">Sign in to OPD Care</p>
      {isLockout && (
        <div data-testid="subscription-lockout-banner" className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {SUBSCRIPTION_INACTIVE_MESSAGE}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Clinic code</label>
          <input
            required
            placeholder="e.g. sunrise-clinic"
            value={clinicSlug}
            onChange={(e) => setClinicSlug(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-teal focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Email, phone or username</label>
          <input
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-teal focus:outline-none"
          />
        </div>
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <label className="block text-sm font-medium text-gray-700">Password</label>
            {resetStatus?.available && (
              <Link
                to={`/forgot-password${clinicSlug ? `?clinic=${encodeURIComponent(clinicSlug.trim())}` : ''}`}
                className="text-xs text-teal underline"
              >
                Forgot password?
              </Link>
            )}
          </div>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-teal focus:outline-none"
          />
        </div>
        {error && !isLockout && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-teal py-2 font-medium text-white transition hover:bg-teal-mid disabled:opacity-60"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-gray-500">
        New patient?{' '}
        <Link to={`/register${clinicSlug ? `?clinic=${clinicSlug}` : ''}`} className="text-teal underline">
          Create an account
        </Link>
      </p>
      <p className="mt-2 text-center text-sm text-gray-500">
        Setting up a new clinic?{' '}
        <Link to="/register-clinic" className="text-teal underline">
          Register your clinic
        </Link>
      </p>
    </div>
  );
}
