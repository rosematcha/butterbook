'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiPost, setToken, ApiError } from '../../lib/api';

interface LoginResponse {
  data: {
    token: string;
    user: { id: string; email: string; totpEnabled: boolean };
    expiresAt: string;
  };
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const body: Record<string, string> = { email, password };
      if (needsTotp && totp) body.totpCode = totp;
      const res = await apiPost<LoginResponse>('/api/v1/auth/login', body);
      setToken(res.data.token);
      router.push('/app');
    } catch (err) {
      if (err instanceof ApiError) {
        if (/TOTP/i.test(err.problem.detail ?? '')) {
          setNeedsTotp(true);
          setError('Enter the 6-digit code from your authenticator app.');
        } else {
          setError(err.problem.detail ?? err.problem.title);
        }
      } else {
        setError('Unable to sign in.');
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="Email">
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
        </Field>
        {needsTotp ? (
          <Field label="Authenticator code">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              value={totp}
              onChange={(e) => setTotp(e.target.value)}
              className="input"
              autoFocus
            />
          </Field>
        ) : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="mt-6 text-sm text-slate-600">
        New?{' '}
        <Link href="/register" className="underline">
          Create an account
        </Link>
        .
      </p>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
