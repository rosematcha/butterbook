'use client';
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
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
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

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-eyebrow">Settings</div>
          <h1 className="h-display mt-1">Stripe</h1>
          <p className="mt-2 max-w-xl text-sm text-paper-600">
            Connect an organization-owned Stripe account so public membership checkout can collect payments directly.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {notice ? <span className="text-sm text-accent-700">{notice}</span> : null}
          {error ? <span className="text-sm text-red-700">{error}</span> : null}
          {status?.connected ? (
            <button type="button" disabled={working} onClick={disconnect} className="btn-ghost text-red-700">
              {working ? 'Working...' : 'Disconnect'}
            </button>
          ) : (
            <button type="button" disabled={working || query.isLoading} onClick={connect} className="btn-accent">
              {working ? 'Opening Stripe...' : 'Connect Stripe'}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="panel p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="h-eyebrow">Account status</div>
              <div className="mt-2 text-2xl font-semibold tracking-tight">
                {query.isLoading ? 'Loading...' : ready ? 'Ready for checkout' : status?.connected ? 'Connected, not ready' : 'Not connected'}
              </div>
            </div>
            <span className={ready ? 'badge-accent' : 'badge'}>
              {ready ? 'Live' : status?.connected ? 'Action needed' : 'Offline'}
            </span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-paper-200 bg-paper-50 p-4">
              <div className="h-eyebrow">Charges</div>
              <div className="mt-1 text-lg">{status?.chargesEnabled ? 'Enabled' : 'Disabled'}</div>
            </div>
            <div className="rounded-md border border-paper-200 bg-paper-50 p-4">
              <div className="h-eyebrow">Payouts</div>
              <div className="mt-1 text-lg">{status?.payoutsEnabled ? 'Enabled' : 'Disabled'}</div>
            </div>
            <div className="rounded-md border border-paper-200 bg-paper-50 p-4">
              <div className="h-eyebrow">Currency</div>
              <div className="mt-1 text-lg uppercase">{status?.defaultCurrency ?? 'usd'}</div>
            </div>
            <div className="rounded-md border border-paper-200 bg-paper-50 p-4">
              <div className="h-eyebrow">Connected</div>
              <div className="mt-1 text-lg">{formatDate(status?.connectedAt ?? null)}</div>
            </div>
          </div>

          {status?.stripeAccountId ? (
            <div className="mt-5 rounded-md border border-paper-200 bg-white p-4 text-sm">
              <div className="h-eyebrow">Stripe account</div>
              <div className="mt-1 font-mono text-paper-700">{status.stripeAccountId}</div>
            </div>
          ) : null}
        </div>

        <aside className="panel p-6">
          <div className="h-eyebrow">Checkout readiness</div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span>Stripe connected</span>
              <span className={status?.connected ? 'text-accent-700' : 'text-paper-500'}>{status?.connected ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Charges enabled</span>
              <span className={status?.chargesEnabled ? 'text-accent-700' : 'text-paper-500'}>{status?.chargesEnabled ? 'Yes' : 'No'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Membership policy</span>
              <a href="/app/memberships/policies" className="text-brand-accent underline underline-offset-4">Review</a>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Public tiers</span>
              <a href="/app/memberships/tiers" className="text-brand-accent underline underline-offset-4">Review</a>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
