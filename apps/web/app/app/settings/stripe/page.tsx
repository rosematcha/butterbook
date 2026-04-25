'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost, ApiError } from '../../../../lib/api';
import { usePermissions } from '../../../../lib/permissions';
import { useSession } from '../../../../lib/session';
import { EmptyState } from '../../../components/empty-state';

interface StripeStatus {
  connected: boolean;
  stripeAccountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  defaultCurrency: string;
  connectedAt: string | null;
  disconnectedAt: string | null;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

type StatusTone = 'live' | 'warn' | 'off';

function StatusDot({ tone }: { tone: StatusTone }) {
  const cls =
    tone === 'live'
      ? 'bg-emerald-500'
      : tone === 'warn'
      ? 'bg-amber-500'
      : 'bg-paper-300';
  return (
    <span className="relative inline-flex h-2 w-2 items-center justify-center">
      <span className={`absolute inline-flex h-4 w-4 rounded-full opacity-30 ${cls}`} />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${cls}`} />
    </span>
  );
}

export default function StripeSettingsPage() {
  const { activeOrgId } = useSession();
  const perms = usePermissions();
  const canManage = perms.has('stripe.manage');
  const qc = useQueryClient();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['stripe', activeOrgId],
    queryFn: () => apiGet<{ data: StripeStatus }>(`/api/v1/orgs/${activeOrgId}/stripe`),
    enabled: !!activeOrgId && canManage,
  });

  async function connect() {
    if (!activeOrgId) return;
    setWorking(true);
    setError(null);
    setNotice(null);
    try {
      const body = await apiPost<{ data: { url: string } }>(`/api/v1/orgs/${activeOrgId}/stripe/connect`);
      window.location.href = body.data.url;
    } catch (err) {
      setError(err instanceof ApiError ? err.problem.detail ?? err.problem.title : 'Unable to start Stripe Connect.');
      setWorking(false);
    }
  }

  async function disconnect() {
    if (!activeOrgId) return;
    if (!confirm('Disconnect Stripe for this organization? Public membership checkout will stop working.')) return;
    setWorking(true);
    setError(null);
    setNotice(null);
    try {
      await apiDelete(`/api/v1/orgs/${activeOrgId}/stripe`);
      setNotice('Stripe has been disconnected.');
      await qc.invalidateQueries({ queryKey: ['stripe', activeOrgId] });
    } catch (err) {
      setError(err instanceof ApiError ? err.problem.detail ?? err.problem.title : 'Unable to disconnect Stripe.');
    } finally {
      setWorking(false);
    }
  }

  if (!perms.loading && !canManage) {
    return <EmptyState title="Permission required." description="Managing Stripe requires the stripe.manage permission." />;
  }

  const status = query.data?.data;
  const ready = !!status?.connected && status.chargesEnabled;
  const tone: StatusTone = ready ? 'live' : status?.connected ? 'warn' : 'off';
  const headline = query.isLoading
    ? 'Checking…'
    : ready
    ? 'Ready for checkout'
    : status?.connected
    ? 'Connected, setup incomplete'
    : 'Not connected';
  const subhead = query.isLoading
    ? 'Fetching account details from Stripe.'
    : ready
    ? 'Public membership checkout will charge through this account.'
    : status?.connected
    ? 'Stripe is linked but one or more requirements are still open in Stripe Dashboard.'
    : 'Link an organization-owned Stripe account to enable public membership checkout.';

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-eyebrow">Settings</div>
          <h1 className="h-display mt-1">Stripe</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-paper-600">
            Connect an organization-owned Stripe account. Your visitors see your name on the
            charge, not Butterbook&rsquo;s.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {notice ? <span className="text-sm text-accent-700">{notice}</span> : null}
          {error ? <span className="text-sm text-red-700">{error}</span> : null}
          {status?.connected ? (
            <button type="button" disabled={working} onClick={disconnect} className="btn-ghost text-red-700">
              {working ? 'Working…' : 'Disconnect'}
            </button>
          ) : (
            <button type="button" disabled={working || query.isLoading} onClick={connect} className="btn-accent">
              {working ? 'Opening Stripe…' : 'Connect Stripe'}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <section className="panel relative overflow-hidden p-6">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full"
              style={{
                background:
                  tone === 'live'
                    ? 'radial-gradient(circle at center, rgb(16 185 129 / 0.12), transparent 65%)'
                    : tone === 'warn'
                    ? 'radial-gradient(circle at center, rgb(245 158 11 / 0.12), transparent 65%)'
                    : 'radial-gradient(circle at center, rgb(var(--brand-accent) / 0.08), transparent 65%)',
              }}
            />
            <div className="relative flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <StatusDot tone={tone} />
                  <span className="h-eyebrow">Account status</span>
                </div>
                <h2 className="mt-2 font-display text-2xl font-medium tracking-tight-er text-ink">
                  {headline}
                </h2>
                <p className="mt-1 max-w-md text-sm text-paper-600">{subhead}</p>
              </div>
              <span
                className={
                  tone === 'live'
                    ? 'shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-700'
                    : tone === 'warn'
                    ? 'shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-amber-700'
                    : 'badge shrink-0'
                }
              >
                {tone === 'live' ? 'Live' : tone === 'warn' ? 'Action needed' : 'Offline'}
              </span>
            </div>

            <dl className="relative mt-6 grid gap-px overflow-hidden rounded-md border border-paper-200 bg-paper-200 sm:grid-cols-2">
              <StatCell label="Charges" value={status?.chargesEnabled ? 'Enabled' : 'Disabled'} good={!!status?.chargesEnabled} />
              <StatCell label="Payouts" value={status?.payoutsEnabled ? 'Enabled' : 'Disabled'} good={!!status?.payoutsEnabled} />
              <StatCell label="Currency" value={(status?.defaultCurrency ?? 'usd').toUpperCase()} mono />
              <StatCell label="Connected" value={formatDate(status?.connectedAt ?? null)} />
            </dl>

            {status?.stripeAccountId ? (
              <div className="relative mt-4 flex items-center justify-between rounded-md border border-dashed border-paper-200 bg-paper-50/60 px-4 py-3 text-sm">
                <div>
                  <div className="h-eyebrow">Stripe account</div>
                  <div className="mt-0.5 font-mono text-xs text-paper-700">{status.stripeAccountId}</div>
                </div>
                <a
                  href={`https://dashboard.stripe.com/${status.stripeAccountId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="link text-xs"
                >
                  Open in Stripe →
                </a>
              </div>
            ) : null}
          </section>

          <section className="panel p-6">
            <h2 className="font-display text-lg font-medium tracking-tight-er text-ink">How it flows</h2>
            <p className="mt-1 text-sm text-paper-600">
              Stripe charges the card and deposits to your bank on your normal payout schedule.
              Butterbook never touches the money.
            </p>
            <ol className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                { n: '01', t: 'Visitor pays', d: 'Public join page → Stripe Checkout.' },
                { n: '02', t: 'Stripe settles', d: 'Funds land in your connected account.' },
                { n: '03', t: 'Butterbook activates', d: 'Membership turns on via webhook.' },
              ].map((step) => (
                <li key={step.n} className="rounded-md border border-paper-200 bg-paper-50/60 p-4">
                  <div className="font-mono text-[11px] tracking-[0.14em] text-paper-500">{step.n}</div>
                  <div className="mt-1.5 font-medium text-ink">{step.t}</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-paper-600">{step.d}</div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <section className="panel p-5">
            <div className="h-eyebrow">Checkout readiness</div>
            <ul className="mt-4 space-y-3 text-sm">
              <ReadinessRow label="Stripe connected" ok={!!status?.connected} />
              <ReadinessRow label="Charges enabled" ok={!!status?.chargesEnabled} />
              <ReadinessRow label="Payouts enabled" ok={!!status?.payoutsEnabled} />
            </ul>
            <div className="mt-5 border-t border-paper-100 pt-4 text-sm">
              <div className="h-eyebrow">Related</div>
              <ul className="mt-2 space-y-1.5">
                <li><Link href="/app/memberships/policies" className="link">Membership policies</Link></li>
                <li><Link href="/app/memberships/tiers" className="link">Public tiers</Link></li>
              </ul>
            </div>
          </section>

          <section className="rounded-lg border border-paper-200 bg-paper-50/70 p-5 text-sm leading-relaxed text-paper-600">
            <div className="h-eyebrow text-paper-500">A note</div>
            <p className="mt-2">
              Butterbook uses Stripe Connect&rsquo;s <span className="font-medium text-ink">standard</span> flow.
              Refunds, disputes, and payout schedules live in your Stripe dashboard.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function StatCell({ label, value, good, mono }: { label: string; value: string; good?: boolean; mono?: boolean }) {
  return (
    <div className="bg-white p-4">
      <div className="h-eyebrow">{label}</div>
      <div className={`mt-1 text-base ${mono ? 'font-mono' : ''} ${good ? 'text-emerald-700' : 'text-ink'}`}>
        {value}
      </div>
    </div>
  );
}

function ReadinessRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-paper-700">{label}</span>
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${ok ? 'text-emerald-700' : 'text-paper-400'}`}>
        {ok ? (
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 12l5 5L20 7" />
          </svg>
        ) : (
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx={12} cy={12} r={9} />
          </svg>
        )}
        {ok ? 'Yes' : 'Not yet'}
      </span>
    </li>
  );
}
