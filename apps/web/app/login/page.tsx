'use client';
import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { apiPost, apiGet, getToken, setToken, ApiError } from '../../lib/api';
import { API_BASE_URL, IS_DEMO } from '../../lib/env';
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

interface SsoPolicy {
  data: { ssoRequired: boolean; providers: string[] };
}

const LAST_EMAIL_KEY = 'butterbook.lastEmail';

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [redirecting, setRedirecting] = useState(true);

  // SSO policy state
  const [ssoRequired, setSsoRequired] = useState(false);
  const [ssoProviders, setSsoProviders] = useState<string[]>([]);
  const [checkingPolicy, setCheckingPolicy] = useState(false);
  const policyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const remembered = window.localStorage.getItem(LAST_EMAIL_KEY);
    if (remembered) setEmail(remembered);

    // Handle SSO callback token
    const ssoToken = params.get('sso_token');
    if (ssoToken) {
      setToken(ssoToken);
      router.replace('/app');
      return;
    }

    if (getToken()) {
      router.replace('/app');
      return;
    }
    setRedirecting(false);
  }, [router, params]);

  // Debounced SSO policy check on email change
  const checkSsoPolicy = useCallback((emailVal: string) => {
    if (policyTimer.current) clearTimeout(policyTimer.current);
    if (!emailVal || !emailVal.includes('@')) {
      setSsoRequired(false);
      setSsoProviders([]);
      return;
    }
    policyTimer.current = setTimeout(async () => {
      setCheckingPolicy(true);
      try {
        const res = await apiGet<SsoPolicy>(
          `/api/v1/sso/policy?email=${encodeURIComponent(emailVal)}`,
        );
        setSsoRequired(res.data.ssoRequired);
        setSsoProviders(res.data.providers);
      } catch {
        setSsoRequired(false);
        setSsoProviders([]);
      } finally {
        setCheckingPolicy(false);
      }
    }, 500);
  }, []);

  function handleEmailChange(val: string) {
    setEmail(val);
    setError(null);
    checkSsoPolicy(val);
  }

  function handleSsoLogin(provider: string) {
    // We need the org slug for the SSO redirect. Since the policy endpoint
    // doesn't return org info (to avoid leaking membership), we redirect to
    // the SSO redirect endpoint which accepts an org slug. For multi-org users,
    // this is a simplification — we let the server figure out the org from the
    // first matching SSO provider.
    // The SSO redirect endpoint needs the org slug, so we pass email directly
    // and let the server resolve it.
    window.location.href = `${API_BASE_URL}/api/v1/sso/redirect-by-email?email=${encodeURIComponent(email)}&provider=${provider}`;
  }

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
      const user: User = {
        id: res.data.user.id,
        email: res.data.user.email,
        totpEnabled: res.data.user.totpEnabled,
      };
      qc.setQueryData(['me'], { data: { user, membership: res.data.membership } });
      router.push('/app');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.problem.type?.includes('sso_required')) {
          setSsoRequired(true);
          setError('Your organization requires SSO. Use the buttons below to sign in.');
        } else if (/TOTP/i.test(err.problem.detail ?? '')) {
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
    return <AuthSplit title={<>Sign in.</>} sub="Pick up where you left off." />;
  }

  if (IS_DEMO) return <DemoEnter />;

  const providerLabels: Record<string, string> = {
    google: 'Sign in with Google',
    microsoft: 'Sign in with Microsoft',
  };

  return (
    <AuthSplit
      title={<>Sign in.</>}
      sub="Pick up where you left off."
    >
      <form onSubmit={onSubmit} className="mt-8 grid gap-4">
        <Field label="Email">
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            className="input"
            placeholder="you@museum.org"
          />
        </Field>

        {ssoRequired ? (
          <>
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            <div className="mt-2 grid gap-3">
              {ssoProviders.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleSsoLogin(p)}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-paper-200 bg-white px-4 py-3 text-sm font-medium text-ink shadow-sm transition hover:bg-paper-50"
                >
                  {p === 'google' ? <GoogleIcon /> : null}
                  {p === 'microsoft' ? <MicrosoftIcon /> : null}
                  {providerLabels[p] ?? `Sign in with ${p}`}
                </button>
              ))}
              {ssoProviders.length === 0 && !checkingPolicy ? (
                <p className="text-sm text-paper-600">
                  SSO is required but no providers are configured. Contact your administrator.
                </p>
              ) : null}
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
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

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthSplit title={<>Sign in.</>} sub="Pick up where you left off." />}>
      <LoginInner />
    </Suspense>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
      <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
      <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
    </svg>
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
