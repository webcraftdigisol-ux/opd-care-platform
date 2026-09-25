import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { confirmPasswordReset, getPasswordResetStatus, requestPasswordReset } from '../api/auth';

const inputClass = 'w-full rounded-md border border-gray-300 px-3 py-2 focus:border-teal focus:outline-none';

// Two steps on one page: ask for a code (sent on WhatsApp), then enter it
// with a new password. The request step's reply is deliberately the same
// whether or not an account matched, so this page never says "no such user".
export function ForgotPasswordPage() {
  const [searchParams] = useSearchParams();
  const [clinicSlug, setClinicSlug] = useState(searchParams.get('clinic') ?? '');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState<'request' | 'confirm' | 'done'>('request');
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { data: resetStatus } = useQuery({ queryKey: ['password-reset-status'], queryFn: getPasswordResetStatus });

  async function handleRequest(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { message } = await requestPasswordReset({ clinicSlug: clinicSlug.trim(), identifier: identifier.trim() });
      setInfo(message);
      setStep('confirm');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Could not send a code. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("The two passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const { message } = await confirmPasswordReset({
        clinicSlug: clinicSlug.trim(),
        identifier: identifier.trim(),
        code: code.trim(),
        newPassword,
      });
      setInfo(message);
      setStep('done');
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Could not reset the password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const loginLink = `/login${clinicSlug.trim() ? `?clinic=${encodeURIComponent(clinicSlug.trim())}` : ''}`;

  return (
    <div className="mx-auto mt-20 max-w-sm rounded-xl bg-white p-8 shadow-md">
      <h1 className="mb-1 text-2xl font-semibold text-teal">Reset password</h1>
      <p className="mb-6 text-sm text-gray-500">We'll send a 6-digit code to your WhatsApp number.</p>

      {resetStatus && !resetStatus.available && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800" data-testid="reset-unavailable">
          Password reset over WhatsApp isn't available yet. Please ask your clinic to reset your password.
        </p>
      )}

      {step === 'request' && resetStatus?.available && (
        <form onSubmit={handleRequest} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Clinic code</label>
            <input
              required
              placeholder="e.g. sunrise-clinic"
              value={clinicSlug}
              onChange={(e) => setClinicSlug(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email or phone</label>
            <input
              required
              data-testid="reset-identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className={inputClass}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-teal py-2 font-medium text-white transition hover:bg-teal-mid disabled:opacity-60"
          >
            {submitting ? 'Sending…' : 'Send code on WhatsApp'}
          </button>
        </form>
      )}

      {step === 'confirm' && (
        <form onSubmit={handleConfirm} className="space-y-4">
          {info && <p className="rounded-md bg-teal-light p-3 text-sm text-teal">{info}</p>}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">6-digit code</label>
            <input
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              data-testid="reset-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className={`${inputClass} tracking-widest`}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">New password</label>
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Confirm new password</label>
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-teal py-2 font-medium text-white transition hover:bg-teal-mid disabled:opacity-60"
          >
            {submitting ? 'Updating…' : 'Set new password'}
          </button>
          <button
            type="button"
            onClick={() => handleRequest()}
            disabled={submitting}
            className="w-full text-sm text-teal underline disabled:opacity-60"
          >
            Didn't get it? Send a new code
          </button>
        </form>
      )}

      {step === 'done' && (
        <div className="space-y-4">
          <p className="rounded-md bg-teal-light p-3 text-sm text-teal">{info}</p>
          <Link
            to={loginLink}
            className="block w-full rounded-md bg-teal py-2 text-center font-medium text-white hover:bg-teal-mid"
          >
            Go to sign in
          </Link>
        </div>
      )}

      {step !== 'done' && (
        <p className="mt-4 text-center text-sm text-gray-500">
          <Link to={loginLink} className="text-teal underline">
            Back to sign in
          </Link>
        </p>
      )}
    </div>
  );
}
