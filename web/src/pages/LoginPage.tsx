import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { login } from '../api/auth';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const [clinicSlug, setClinicSlug] = useState(searchParams.get('clinic') ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { setSession } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { token, user, clinic } = await login({ clinicSlug: clinicSlug.trim(), email, password });
      setSession(token, user, clinic);
      navigate(
        user.role === 'DOCTOR'
          ? '/doctor'
          : user.role === 'ADMIN'
            ? '/admin'
            : user.role === 'PHARMACIST'
              ? '/pharmacy'
              : user.role === 'LAB_TECHNICIAN'
                ? '/lab'
                : '/',
      );
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto mt-20 max-w-sm rounded-xl bg-white p-8 shadow-md">
      <h1 className="mb-1 text-2xl font-semibold text-teal">Welcome back</h1>
      <p className="mb-6 text-sm text-gray-500">Sign in to OPD Care</p>
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
          <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-teal focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-teal focus:outline-none"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
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
