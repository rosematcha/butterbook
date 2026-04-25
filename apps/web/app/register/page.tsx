'use client';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiPost, setToken, ApiError } from '../../lib/api';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await apiPost('/api/v1/auth/register', {
        email,
        password,
        ...(displayName ? { displayName } : {}),
      });
      const res = await apiPost<{ data: { token: string } }>('/api/v1/auth/login', { email, password });
      setToken(res.data.token);
      router.push('/app/orgs/new');
    } catch (err) {
      setError(err instanceof ApiError ? err.problem.detail ?? err.problem.title : 'Could not register.');
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthSplit
      eyebrow="Start free"
      title={
        <>
          Create an<br />
          account.
        </>
      }
      sub="No credit card. Cancel anytime."
    >
      <form onSubmit={onSubmit} className="mt-8 grid gap-4">
        <Field label="Display name">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="input"
            placeholder="Your name"
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder="you@museum.org"
            autoComplete="email"
          />
        </Field>
        <Field label="Password" hint={<span className="text-paper-500">min 12 characters</span>}>
          <input
            type="password"
            required
            minLength={12}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            autoComplete="new-password"
          />
        </Field>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="mt-2 inline-flex items-center justify-center rounded-md bg-brand-primary px-4 py-3 text-sm font-medium text-brand-on-primary shadow-[0_1px_0_rgb(0_0_0/0.08)] transition hover:bg-brand-primary/90 disabled:opacity-60"
        >
          {pending ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p className="mt-5 text-[13px] text-paper-600">
        Already have an account?{' '}
        <Link href="/login" className="text-brand-accent">
          Sign in
        </Link>
        .
      </p>
    </AuthSplit>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="flex justify-between text-xs text-paper-600">
        <span>{label}</span>
        {hint}
      </span>
      {children}
    </label>
  );
}

function AuthSplit({
  title,
  sub,
  children,
  eyebrow,
}: {
  title: ReactNode;
  sub: string;
  children: ReactNode;
  eyebrow: string;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col px-7 py-10 sm:px-14">
        <Wordmark />
        <div className="flex max-w-[400px] flex-1 flex-col justify-center">
          <div className="eyebrow mb-3.5">{eyebrow}</div>
          <h1
            className="font-display"
            style={{ fontSize: 48, letterSpacing: '-0.035em', fontWeight: 400, lineHeight: 1 }}
          >
            {title}
          </h1>
          <p className="mt-3 text-paper-600">{sub}</p>
          {children}
        </div>
        <div className="text-[11px] text-paper-500">© Butterbook · Privacy · Terms</div>
      </div>
      <AuthSidePanel />
    </div>
  );
}

function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5 leading-none">
      <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="4" cy="10" r="2.2" className="fill-brand-accent" />
        <circle cx="16" cy="10" r="2.2" className="fill-brand-accent" />
        <rect x="4" y="9.4" width="12" height="1.2" className="fill-brand-accent" opacity="0.55" />
      </svg>
      <span
        style={{ fontSize: size * 0.95, lineHeight: 1 }}
        className="font-display font-medium tracking-tight-er text-ink"
      >
        Butterbook
      </span>
    </Link>
  );
}

function AuthSidePanel() {
  return (
    <aside className="relative hidden overflow-hidden border-l border-paper-200 bg-paper-100 p-12 lg:flex lg:items-center lg:justify-center">
      <div className="max-w-[440px]">
        <div className="eyebrow mb-5">
          <span className="text-brand-accent">●</span>&nbsp;&nbsp;Butterbook
        </div>
        <p
          className="m-0 font-display"
          style={{ fontSize: 28, letterSpacing: '-0.02em', lineHeight: 1.25, fontWeight: 380 }}
        >
          Reservation software for
          <br />
          <span className="italic text-brand-accent">small organizations.</span>
        </p>
        <div className="mt-7 grid max-w-[340px] gap-2.5 text-[13px] text-paper-600">
          {[
            ['01', 'One flat rate. No per-visitor or per-seat fees.'],
            ['02', 'Soft warnings, not hard gates.'],
            ['03', 'CSV and JSON exports anytime.'],
          ].map(([n, t]) => (
            <div key={n} className="flex gap-2.5">
              <span className="tabular min-w-[22px] font-display text-paper-500">{n}</span>
              <span>{t}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
