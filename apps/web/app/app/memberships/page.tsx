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
    enabled: !!activeOrgId && canManage,
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

  if (!perms.loading && !canView) {
    return <EmptyState title="Permission required." description="Membership records require the memberships.view_all permission." />;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-eyebrow">Members & CRM</div>
          <h1 className="h-display mt-1">Memberships</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-paper-600">
            Track manually enrolled memberships, renewals, cancellations, and expiry state before Stripe self-serve comes online.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/app/memberships/tiers" className="btn-secondary">Tiers</Link>
          <Link href="/app/memberships/policies" className="btn-secondary">Policies</Link>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="panel p-4">
          <div className="grid gap-3 sm:grid-cols-[180px_1fr_auto]">
            <select className="input" value={status} onChange={(e) => { setStatus(e.target.value as MembershipStatus | ''); setPage(1); }}>
              {STATUSES.map((s) => <option key={s.value || 'all'} value={s.value}>{s.label}</option>)}
            </select>
            <select className="input" value={tierId} onChange={(e) => { setTierId(e.target.value); setPage(1); }}>
              <option value="">All tiers</option>
              {tierRows.map((tier) => <option key={tier.id} value={tier.id}>{tier.name}</option>)}
            </select>
            <button className="btn-secondary" onClick={() => { setStatus(''); setTierId(''); setPage(1); }}>Clear</button>
          </div>
        </div>

        {canManage ? (
          <form onSubmit={onCreate} className="panel p-4">
            <h2 className="font-display text-base font-medium text-ink">Manual enrollment</h2>
            <div className="mt-3 space-y-2">
              <select required className="input" value={draft.visitorId} onChange={(e) => setDraft((d) => ({ ...d, visitorId: e.target.value }))}>
                <option value="">Choose contact</option>
                {(contacts.data?.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{[c.firstName, c.lastName].filter(Boolean).join(' ') || c.email}</option>
                ))}
              </select>
              <select required className="input" value={draft.tierId} onChange={(e) => setDraft((d) => ({ ...d, tierId: e.target.value }))}>
                <option value="">Choose tier</option>
                {tierRows.filter((t) => t.active).map((tier) => <option key={tier.id} value={tier.id}>{tier.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input className="input" type="date" value={draft.startsAt} onChange={(e) => setDraft((d) => ({ ...d, startsAt: e.target.value }))} aria-label="Starts at" />
                <input className="input" type="date" value={draft.expiresAt} onChange={(e) => setDraft((d) => ({ ...d, expiresAt: e.target.value }))} aria-label="Expires at" />
              </div>
              <input className="input" inputMode="decimal" value={draft.amount} onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))} placeholder="Payment amount, optional" />
              <input className="input" value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} placeholder="Payment note, optional" />
              <button className="btn w-full" disabled={create.isPending || !draft.visitorId || !draft.tierId}>{create.isPending ? 'Enrolling...' : 'Enroll member'}</button>
            </div>
          </form>
        ) : null}
      </section>

      {memberships.isSuccess && rows.length === 0 ? (
        <EmptyState title="No memberships match this view." description="Create tiers first, then enroll contacts manually from this page." />
      ) : (
        <section className="panel overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-paper-200 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-paper-500">
                <th className="px-4 py-2">Member</th>
                <th className="px-4 py-2">Tier</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Expires</th>
                <th className="px-4 py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {memberships.isPending ? <SkeletonRows cols={5} rows={6} /> : rows.map((member) => (
                <tr key={member.id} className="border-t border-paper-100 transition hover:bg-paper-50/70">
                  <td className="px-4 py-3">
                    <Link href={`/app/memberships/profile?id=${member.id}`} className="font-medium text-ink hover:text-brand-accent">{memberName(member)}</Link>
                    <div className="text-xs text-paper-500">{member.visitor.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{member.tier.name}</div>
                    <div className="text-xs text-paper-500">{money(member.tier.priceCents)} / {intervalLabel(member.tier.billingInterval)}</div>
                  </td>
                  <td className="px-4 py-3"><span className={statusClass(member.status)}>{member.status}</span></td>
                  <td className="px-4 py-3 text-paper-700">{member.expiresAt ? <Timestamp value={member.expiresAt} absolute /> : 'Never'}</td>
                  <td className="px-4 py-3 text-paper-600"><Timestamp value={member.updatedAt} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {meta && meta.pages > 1 ? (
        <div className="flex items-center justify-between text-sm text-paper-600">
          <span>{meta.total} memberships</span>
          <div className="flex items-center gap-2">
            <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
            <span>Page {meta.page} of {meta.pages}</span>
            <button className="btn-secondary" disabled={page >= meta.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
