'use client';
import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, ApiError } from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { useSession } from '../../../lib/session';
import { useToast } from '../../../lib/toast';
import { EmptyState } from '../../components/empty-state';
import { SkeletonRows } from '../../components/skeleton-rows';
import { Timestamp } from '../../components/timestamp';
import type { ContactListResponse } from '../contacts/types';
import { MembershipsTabs } from './_components/tabs';
import {
  intervalLabel,
  memberName,
  money,
  statusClass,
  type Membership,
  type MembershipListResponse,
  type MembershipStatus,
  type MembershipTier,
} from './types';

const STATUSES: Array<{ value: MembershipStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'expired', label: 'Expired' },
  { value: 'lapsed', label: 'Lapsed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'refunded', label: 'Refunded' },
];

function apiErrMsg(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.problem.detail ?? e.problem.title : fallback;
}

export default function MembershipsPage() {
  const { activeOrgId } = useSession();
  const perms = usePermissions();
  const canView = perms.has('memberships.view_all');
  const canManage = perms.has('memberships.manage');
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState<MembershipStatus | ''>('');
  const [tierId, setTierId] = useState('');
  const [page, setPage] = useState(1);
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [draft, setDraft] = useState({ visitorId: '', tierId: '', startsAt: '', expiresAt: '', amount: '', notes: '' });

  const listQuery = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), limit: '50' });
    if (status) p.set('status', status);
    if (tierId) p.set('tier_id', tierId);
    return p.toString();
  }, [page, status, tierId]);

  const memberships = useQuery({
    queryKey: ['memberships', activeOrgId, listQuery],
    queryFn: () => apiGet<MembershipListResponse>(`/api/v1/orgs/${activeOrgId}/memberships?${listQuery}`),
    enabled: !!activeOrgId && canView,
  });
  const tiers = useQuery({
    queryKey: ['membership-tiers', activeOrgId],
    queryFn: () => apiGet<{ data: MembershipTier[] }>(`/api/v1/orgs/${activeOrgId}/membership-tiers`),
    enabled: !!activeOrgId && canView,
  });
  const contacts = useQuery({
    queryKey: ['contacts', activeOrgId, 'page=1&limit=200'],
    queryFn: () => apiGet<ContactListResponse>(`/api/v1/orgs/${activeOrgId}/contacts?page=1&limit=200`),
    enabled: !!activeOrgId && canManage && enrollOpen,
  });

  const create = useMutation({
    mutationFn: () =>
      apiPost<{ data: Membership }>(`/api/v1/orgs/${activeOrgId}/memberships`, {
        visitorId: draft.visitorId,
        tierId: draft.tierId,
        ...(draft.startsAt ? { startsAt: new Date(draft.startsAt).toISOString() } : {}),
        ...(draft.expiresAt ? { expiresAt: new Date(draft.expiresAt).toISOString() } : {}),
        ...(draft.amount.trim() ? { amountCents: Math.round(Number(draft.amount) * 100) } : {}),
        ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
      }),
    onSuccess: (res) => {
      setDraft({ visitorId: '', tierId: '', startsAt: '', expiresAt: '', amount: '', notes: '' });
      setEnrollOpen(false);
      qc.invalidateQueries({ queryKey: ['memberships', activeOrgId] });
      toast.push({ kind: 'success', message: 'Membership enrolled', description: res.data.visitor.email });
    },
    onError: (e) => toast.push({ kind: 'error', message: apiErrMsg(e, 'Membership could not be created') }),
  });

  function onCreate(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  const rows = memberships.data?.data ?? [];
  const meta = memberships.data?.meta;
  const tierRows = tiers.data?.data ?? [];

  const counts = useMemo(() => {
    const map: Record<MembershipStatus, number> = {
      active: 0,
      pending: 0,
      expired: 0,
      lapsed: 0,
      cancelled: 0,
      refunded: 0,
    };
    for (const m of rows) map[m.status] += 1;
    return map;
  }, [rows]);

  if (!perms.loading && !canView) {
    return (
      <EmptyState
        title="Permission required."
        description="Membership records require the memberships.view_all permission."
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-eyebrow">Members &amp; CRM</div>
          <h1 className="h-display mt-1">Memberships</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-paper-600">
            Track enrollments, renewals, and lapses. Enroll members manually, or open public
            checkout once Stripe is connected.
          </p>
        </div>
        <div className="flex gap-2">
          {canManage ? (
            <button
              type="button"
              onClick={() => setEnrollOpen((v) => !v)}
              className={enrollOpen ? 'btn-secondary' : 'btn'}
              disabled={!enrollOpen && tierRows.filter((t) => t.active).length === 0}
              title={tierRows.filter((t) => t.active).length === 0 ? 'Create an active membership tier first.' : undefined}
            >
              {enrollOpen ? 'Close' : 'Enroll member'}
            </button>
          ) : null}
        </div>
      </div>

      <MembershipsTabs />

      <section className="mb-6 grid gap-px overflow-hidden rounded-lg border border-paper-200 bg-paper-200 sm:grid-cols-3 lg:grid-cols-6">
        <StatCell label="Active" value={counts.active} tone="live" />
        <StatCell label="Pending" value={counts.pending} tone="warn" />
        <StatCell label="Expired" value={counts.expired} />
        <StatCell label="Lapsed" value={counts.lapsed} />
        <StatCell label="Cancelled" value={counts.cancelled} />
        <StatCell label="Refunded" value={counts.refunded} />
      </section>

      {canManage && enrollOpen ? (
        <form onSubmit={onCreate} className="panel mb-6 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-medium tracking-tight-er text-ink">Enroll a member</h2>
              <p className="mt-1 text-sm text-paper-600">
                For comped memberships, in-person sales, or backfill from another system.
              </p>
            </div>
            <button type="button" className="btn-ghost" onClick={() => setEnrollOpen(false)}>Cancel</button>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="h-eyebrow">Contact</span>
              <select
                required
                className="input mt-1"
                value={draft.visitorId}
                onChange={(e) => setDraft((d) => ({ ...d, visitorId: e.target.value }))}
              >
                <option value="">Choose contact</option>
                {(contacts.data?.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {[c.firstName, c.lastName].filter(Boolean).join(' ') || c.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="h-eyebrow">Tier</span>
              <select
                required
                className="input mt-1"
                value={draft.tierId}
                onChange={(e) => setDraft((d) => ({ ...d, tierId: e.target.value }))}
              >
                <option value="">Choose tier</option>
                {tierRows.filter((t) => t.active).map((tier) => (
                  <option key={tier.id} value={tier.id}>
                    {tier.name} · {money(tier.priceCents)} / {intervalLabel(tier.billingInterval)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="h-eyebrow">Starts</span>
              <input
                className="input mt-1"
                type="date"
                value={draft.startsAt}
                onChange={(e) => setDraft((d) => ({ ...d, startsAt: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="h-eyebrow">Expires</span>
              <input
                className="input mt-1"
                type="date"
                value={draft.expiresAt}
                onChange={(e) => setDraft((d) => ({ ...d, expiresAt: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="h-eyebrow">Payment amount (optional)</span>
              <input
                className="input mt-1 tabular-nums"
                inputMode="decimal"
                value={draft.amount}
                onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                placeholder="0.00"
              />
            </label>
            <label className="block">
              <span className="h-eyebrow">Note (optional)</span>
              <input
                className="input mt-1"
                value={draft.notes}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                placeholder="e.g. comped for gala"
              />
            </label>
          </div>
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="submit"
              className="btn"
              disabled={create.isPending || !draft.visitorId || !draft.tierId}
            >
              {create.isPending ? 'Enrolling…' : 'Enroll member'}
            </button>
          </div>
        </form>
      ) : null}

      <section className="mb-4 panel p-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
          <select
            className="input"
            value={status}
            onChange={(e) => { setStatus(e.target.value as MembershipStatus | ''); setPage(1); }}
          >
            {STATUSES.map((s) => <option key={s.value || 'all'} value={s.value}>{s.label}</option>)}
          </select>
          <select
            className="input"
            value={tierId}
            onChange={(e) => { setTierId(e.target.value); setPage(1); }}
          >
            <option value="">All tiers</option>
            {tierRows.map((tier) => <option key={tier.id} value={tier.id}>{tier.name}</option>)}
          </select>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => { setStatus(''); setTierId(''); setPage(1); }}
            disabled={!status && !tierId}
          >
            Clear filters
          </button>
        </div>
      </section>

      {memberships.isSuccess && rows.length === 0 ? (
        <EmptyState
          title="No memberships match this view."
          description="Create tiers first, then enroll contacts manually. Or wait for public checkout to flow in."
        />
      ) : (
        <section className="panel overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-paper-200 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-paper-500">
                <th className="px-5 py-3">Member</th>
                <th className="px-5 py-3">Tier</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Expires</th>
                <th className="px-5 py-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {memberships.isPending
                ? <SkeletonRows cols={5} rows={6} />
                : rows.map((member) => (
                  <tr key={member.id} className="group border-t border-paper-100 transition hover:bg-paper-50/70">
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/app/memberships/profile?id=${member.id}`}
                        className="font-medium text-ink transition group-hover:text-brand-accent"
                      >
                        {memberName(member)}
                      </Link>
                      <div className="text-xs text-paper-500">{member.visitor.email}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-ink">{member.tier.name}</div>
                      <div className="text-xs text-paper-500 tabular-nums">
                        {money(member.tier.priceCents)} / {intervalLabel(member.tier.billingInterval)}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={statusClass(member.status)}>{member.status}</span>
                    </td>
                    <td className="px-5 py-3.5 text-paper-700 tabular-nums">
                      {member.expiresAt ? <Timestamp value={member.expiresAt} absolute /> : <span className="text-paper-400">Never</span>}
                    </td>
                    <td className="px-5 py-3.5 text-paper-600">
                      <Timestamp value={member.updatedAt} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          </div>
        </section>
      )}

      {meta && meta.pages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-paper-600">
          <span className="tabular-nums">{meta.total} memberships</span>
          <div className="flex items-center gap-2">
            <button
              className="btn-ghost"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Previous
            </button>
            <span className="tabular-nums">
              Page {meta.page} of {meta.pages}
            </span>
            <button
              className="btn-ghost"
              disabled={page >= meta.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatCell({ label, value, tone }: { label: string; value: number; tone?: 'live' | 'warn' }) {
  return (
    <div className="bg-white px-5 py-4">
      <div className="flex items-center gap-2">
        {tone ? (
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              tone === 'live' ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
          />
        ) : null}
        <div className="h-eyebrow">{label}</div>
      </div>
      <div className="mt-1.5 font-display text-2xl font-medium tabular-nums tracking-tight-er text-ink">
        {value}
      </div>
    </div>
  );
}
