'use client';
// Shared "Step inside" card. Rendered at two places on the demo deployment:
//   - demo.butterbook.app/        (root — the Snipe-IT-style login screen)
//   - demo.butterbook.app/login   (a user typing /login out of habit still works)
//
// Keeps the visual shell (split layout, wordmark, side panel) self-contained
// so neither of those pages has to reach into login/page.tsx for internals.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ApiError, apiPost, getToken, setToken } from '../../lib/api';
import { MARKETING_URL } from '../../lib/env';

interface DemoSessionResponse {
  data: { token: string; orgId: string; expiresAt: string };
}

export function DemoEnter() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enterDemo() {
    setError(null);
    setPending(true);
    try {
      // Reuse a valid token if the visitor's sandbox is still alive.
      if (getToken()) {
        router.push('/app');
        return;
      }
      const res = await apiPost<DemoSessionResponse>('/api/v1/demo/session', {});
      setToken(res.data.token);
      router.push('/app');
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError('The demo is at capacity right now. Try again in a few minutes.');
      } else {
        setError('Something went wrong opening the demo. Refresh and try again.');
      }
      setPending(false);
    }
  }

  return (
    <Shell title="Step inside." sub="The admin account is already set up. No sign-up, no email." eyebrow="Butterbook · Demo">
      <div className="mt-8 grid gap-4">
        <FieldLabel label="Email">
          <input
            value="admin"
            readOnly
            className="input tabular cursor-not-allowed bg-paper-100 text-paper-700"
          />
        </FieldLabel>
        <FieldLabel label="Password">
          <input
            type="password"
            value="password"
            readOnly
            className="input tabular cursor-not-allowed bg-paper-100 text-paper-700"
          />
        </FieldLabel>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <button
          type="button"
          onClick={enterDemo}
          disabled={pending}
          className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-primary px-4 py-3 text-sm font-medium text-brand-on-primary shadow-[0_1px_0_rgb(0_0_0/0.08)] transition hover:bg-brand-primary/90 disabled:opacity-60"
        >
          {pending ? 'Opening the sandbox…' : 'Enter the demo'}
        </button>
      </div>
      <p className="mt-5 text-[13px] text-paper-600">
        Sandbox deletes after twelve hours of inactivity.{' '}
        <Link href="/demo" className="text-brand-accent">
          What&apos;s in it?
        </Link>
      </p>
      <p className="mt-2 text-[13px] text-paper-600">
        Ready for real guests?{' '}
        <a href={`${MARKETING_URL}/register?ref=demo`} className="text-brand-accent">
          Sign up for real
        </a>
        .
      </p>
    </Shell>
  );
}

/* ---------- Presentation ---------- */

function Shell({
  title,
  sub,
  eyebrow,
  children,
}: {
  title: string;
  sub: string;
  eyebrow: string;
  children: ReactNode;
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
        <div className="text-[11px] text-paper-500">© Butterbook · The Whitman is not a real museum.</div>
      </div>
      <SidePanel />
    </div>
  );
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="flex justify-between text-xs text-paper-600">
        <span>{label}</span>
      </span>
      {children}
    </label>
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

function SidePanel() {
  // Three short lines of demo-specific flavor — no "why pick us" pitch, since
  // the visitor is already committed enough to be looking at a login screen.
  const lines: Array<[string, string]> = [
    ['01', 'Every page of the real app.'],
    ['02', 'Pre-loaded with fake guests at a fictional museum.'],
    ['03', 'Your changes wipe on their own.'],
  ];
  return (
    <aside className="relative hidden overflow-hidden border-l border-paper-200 bg-paper-100 p-12 lg:flex lg:items-center lg:justify-center">
      <div className="max-w-[440px]">
        <div className="eyebrow mb-5">
          <span className="text-brand-accent">●</span>&nbsp;&nbsp;The Whitman · Sandbox
        </div>
        <p
          className="m-0 font-display"
          style={{ fontSize: 28, letterSpacing: '-0.02em', lineHeight: 1.25, fontWeight: 380 }}
        >
          The whole app,
          <br />
          <span className="italic text-brand-accent">yours for the afternoon.</span>
        </p>
        <div className="mt-7 grid max-w-[340px] gap-2.5 text-[13px] text-paper-600">
          {lines.map(([n, t]) => (
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
