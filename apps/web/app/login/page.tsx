'use client';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { apiPost, getToken, setToken, ApiError } from '../../lib/api';
import { IS_DEMO } from '../../lib/env';
import type { Membership, User } from '../../lib/session';
import { DemoEnter } from '../components/demo-enter';

interface LoginResponse {
  data: {
    token: string;
    user: { id: string; email: string; totpEnabled: boolean };
    expiresAt: string;
    membership: Membership | null;
  };
}

const LAST_EMAIL_KEY = 'butterbook.lastEmail';

export default function LoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Block paint until useEffect confirms there's no token to redirect on.
  // Initialized to true for both SSR and hydration (no mismatch); the effect
  // flips it false for signed-out users. We no longer probe /auth/me here —
  // the app layout validates the token and bounces back on 401.
  const [redirecting, setRedirecting] = useState(true);

  useEffect(() => {
    const remembered = window.localStorage.getItem(LAST_EMAIL_KEY);
    if (remembered) setEmail(remembered);

    if (getToken()) {
      router.replace('/app');
      return;
    }
    setRedirecting(false);
  }, [router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const body: Record<string, string> = { email, password };
      if (needsTotp && totp) body.totpCode = totp;
      const res = await apiPost<LoginResponse>('/api/v1/auth/login', body);
      setToken(res.data.token);
      window.localStorage.setItem(LAST_EMAIL_KEY, email);
      // Seed the ['me'] query so AppLayout doesn't re-fetch /auth/me on mount —
      // the login response already carries user + membership.
      const user: User = {
        id: res.data.user.id,
        email: res.data.user.email,
        totpEnabled: res.data.user.totpEnabled,
      };
      qc.setQueryData(['me'], { data: { user, membership: res.data.membership } });
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

  if (redirecting) {
    // We already have a token — AppLayout will validate it and bounce us back
    // here if it's stale. No splash copy: the redirect is nearly instant, and
    // the "Checking your session…" line used to block paint for ~1s needlessly.
    return <AuthSplit title={<>Sign in.</>} sub="Pick up where you left off." />;
  }

  // Demo bundle reuses the same "Step inside" card as the root page so a
  // visitor hitting /login out of habit sees the same screen instead of the
  // real sign-in form (which can't succeed against the demo API anyway).
  if (IS_DEMO) return <DemoEnter />;

  return (
    <AuthSplit
      title={
        <>
          Sign in.
        </>
      }
      sub="Pick up where you left off."
    >
      <form onSubmit={onSubmit} className="mt-8 grid gap-4">
        <Field label="Email">
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder="you@museum.org"
          />
        </Field>
        <Field
          label="Password"
          hint={
            <Link href="#" className="text-brand-accent">
              Forgot?
            </Link>
          }
        >
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
              className="input tabular"
              placeholder="000 000"
              maxLength={6}
              autoFocus
            />
          </Field>
        ) : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="mt-2 inline-flex items-center justify-center rounded-md bg-brand-primary px-4 py-3 text-sm font-medium text-brand-on-primary shadow-[0_1px_0_rgb(0_0_0/0.08)] transition hover:bg-brand-primary/90 disabled:opacity-60"
        >
          {pending ? 'Signing in…' : needsTotp ? 'Verify and continue' : 'Sign in'}
        </button>
      </form>
      <p className="mt-5 text-[13px] text-paper-600">
        New here?{' '}
        <Link href="/register" className="text-brand-accent">
          Create an account
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
  eyebrow = 'Welcome back',
}: {
  title: ReactNode;
  sub: string;
  children?: ReactNode;
  eyebrow?: string;
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
            ['01', 'Flat-rate pricing. No per-visitor fees, ever.'],
            ['02', 'Soft signals, not hard gates.'],
            ['03', 'Your data exports as CSV anytime, without a support ticket.'],
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
