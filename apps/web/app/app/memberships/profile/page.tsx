'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost, ApiError } from '../../../../lib/api';
import { useConfirm } from '../../../../lib/confirm';
import { usePermissions } from '../../../../lib/permissions';
import { useSession } from '../../../../lib/session';
import { useToast } from '../../../../lib/toast';
import { EmptyState } from '../../../components/empty-state';
import { Timestamp } from '../../../components/timestamp';
import { intervalLabel, memberName, money, statusClass, type Membership, type MembershipStatus } from '../types';

function apiErrMsg(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.problem.detail ?? e.problem.title : fallback;
}

export default function MembershipProfilePage() {
  return (
    <Suspense fallback={null}>
      <MembershipProfileInner />
    </Suspense>
  );
}

function MembershipProfileInner() {
  const { activeOrgId } = useSession();
  const perms = usePermissions();
  const canView = perms.has('memberships.view_all');
  const canManage = perms.has('memberships.manage');
  const canRefund = perms.has('memberships.refund');
  const params = useSearchParams();
  const id = params.get('id');
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState<MembershipStatus>('active');
  const [expiresAt, setExpiresAt] = useState('');
  const [autoRenew, setAutoRenew] = useState(false);
  const [renewDraft, setRenewDraft] = useState({ expiresAt: '', amount: '', notes: '' });

  const query = useQuery({
    queryKey: ['membership', activeOrgId, id],
    queryFn: () => apiGet<{ data: Membership }>(`/api/v1/orgs/${activeOrgId}/memberships/${id}`),
    enabled: !!activeOrgId && !!id && canView,
  });

  useEffect(() => {
    const member = query.data?.data;
    if (!member) return;
    setStatus(member.status);
    setExpiresAt(member.expiresAt ? member.expiresAt.slice(0, 10) : '');
    setAutoRenew(member.autoRenew);
  }, [query.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['membership', activeOrgId, id] });
    qc.invalidateQueries({ queryKey: ['memberships', activeOrgId] });
  };

  const update = useMutation({
    mutationFn: () =>
      apiPatch<{ data: Membership }>(`/api/v1/orgs/${activeOrgId}/memberships/${id}`, {
        status,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        autoRenew,
      }),
    onSuccess: () => {
      invalidate();
      toast.push({ kind: 'success', message: 'Membership updated' });
    },
    onError: (e) => toast.push({ kind: 'error', message: apiErrMsg(e, 'Membership could not be updated') }),
  });

  const renew = useMutation({
    mutationFn: () =>
      apiPost<{ data: Membership }>(`/api/v1/orgs/${activeOrgId}/memberships/${id}/renew`, {
        ...(renewDraft.expiresAt ? { expiresAt: new Date(renewDraft.expiresAt).toISOString() } : {}),
        ...(renewDraft.amount.trim() ? { amountCents: Math.round(Number(renewDraft.amount) * 100) } : {}),
        ...(renewDraft.notes.trim() ? { notes: renewDraft.notes.trim() } : {}),
      }),
    onSuccess: () => {
      setRenewDraft({ expiresAt: '', amount: '', notes: '' });
      invalidate();
      toast.push({ kind: 'success', message: 'Membership renewed' });
    },
    onError: (e) => toast.push({ kind: 'error', message: apiErrMsg(e, 'Membership could not be renewed') }),
  });

  const cancel = useMutation({
    mutationFn: (reason: string) => apiPost<{ data: Membership }>(`/api/v1/orgs/${activeOrgId}/memberships/${id}/cancel`, { reason }),
    onSuccess: () => {
      invalidate();
      toast.push({ kind: 'success', message: 'Membership cancelled' });
    },
    onError: (e) => toast.push({ kind: 'error', message: apiErrMsg(e, 'Membership could not be cancelled') }),
  });

  const refund = useMutation({
    mutationFn: () => apiPost<{ data: Membership }>(`/api/v1/orgs/${activeOrgId}/memberships/${id}/refund`, {}),
    onSuccess: () => {
      invalidate();
      toast.push({ kind: 'success', message: 'Membership refunded' });
    },
    onError: (e) => toast.push({ kind: 'error', message: apiErrMsg(e, 'Membership could not be refunded') }),
  });

  async function onCancel() {
    const ok = await confirm({
      title: 'Cancel this membership?',
      description: 'The member keeps their contact record, but this membership stops counting as active.',
      confirmLabel: 'Cancel membership',
      danger: true,
    });
    if (ok) cancel.mutate('Cancelled by admin');
  }

  async function onRefund() {
    const ok = await confirm({
      title: 'Mark this membership refunded?',
      description: 'This records a manual refund in Butterbook. It does not send money through Stripe.',
      confirmLabel: 'Mark refunded',
      danger: true,
    });
    if (ok) refund.mutate();
  }

  function onSave(e: FormEvent) {
    e.preventDefault();
    update.mutate();
  }

  if (!id) return <EmptyState title="Membership not found." description="Open a membership from the list to view details." />;
  if (!perms.loading && !canView) {
    return <EmptyState title="Permission required." description="Membership details require the memberships.view_all permission." />;
  }

  const member = query.data?.data;

  if (query.isSuccess && !member) return <EmptyState title="Membership not found." />;
  if (!member) return <div className="panel h-40 animate-pulse" />;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-eyebrow">Membership profile</div>
          <h1 className="h-display mt-1">{memberName(member)}</h1>
          <p className="mt-2 text-sm text-paper-600">{member.visitor.email}</p>
        </div>
        <div className="flex gap-2">
          <Link className="btn-secondary" href={`/app/contacts/profile?id=${member.visitorId}`}>Contact profile</Link>
          <Link className="btn-secondary" href="/app/memberships">All memberships</Link>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <form onSubmit={onSave} className="panel space-y-5 p-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <div className="h-eyebrow">Tier</div>
              <div className="mt-1 font-medium text-ink">{member.tier.name}</div>
              <div className="text-sm text-paper-600">{money(member.tier.priceCents)} / {intervalLabel(member.tier.billingInterval)}</div>
            </div>
            <div>
              <div className="h-eyebrow">Started</div>
              <div className="mt-1 text-sm text-paper-700">{member.startedAt ? <Timestamp value={member.startedAt} absolute /> : '-'}</div>
            </div>
            <div>
              <div className="h-eyebrow">State</div>
              <div className="mt-1"><span className={statusClass(member.status)}>{member.status}</span></div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="h-eyebrow">Status</span>
              <select disabled={!canManage} className="input mt-1" value={status} onChange={(e) => setStatus(e.target.value as MembershipStatus)}>
                {['pending', 'active', 'expired', 'lapsed', 'cancelled', 'refunded'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="h-eyebrow">Expires</span>
              <input disabled={!canManage} className="input mt-1" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm text-paper-700">
              <input disabled={!canManage} type="checkbox" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} />
              Auto-renew
            </label>
          </div>

          {member.cancelledAt ? (
            <div className="rounded-md border border-paper-200 bg-paper-50 p-3 text-sm text-paper-700">
              Cancelled <Timestamp value={member.cancelledAt} absolute />{member.cancelledReason ? `: ${member.cancelledReason}` : ''}
            </div>
          ) : null}

          {canManage ? <button className="btn" disabled={update.isPending}>{update.isPending ? 'Saving...' : 'Save changes'}</button> : null}
        </form>

        <div className="space-y-4">
          {canManage ? (
            <form onSubmit={(e) => { e.preventDefault(); renew.mutate(); }} className="panel space-y-3 p-4">
              <h2 className="font-display text-base font-medium text-ink">Renew</h2>
              <input className="input" type="date" value={renewDraft.expiresAt} onChange={(e) => setRenewDraft((d) => ({ ...d, expiresAt: e.target.value }))} aria-label="Renewal expiry" />
              <input className="input" inputMode="decimal" value={renewDraft.amount} onChange={(e) => setRenewDraft((d) => ({ ...d, amount: e.target.value }))} placeholder="Payment amount, optional" />
              <input className="input" value={renewDraft.notes} onChange={(e) => setRenewDraft((d) => ({ ...d, notes: e.target.value }))} placeholder="Payment note, optional" />
              <button className="btn w-full" disabled={renew.isPending}>{renew.isPending ? 'Renewing...' : 'Record renewal'}</button>
            </form>
          ) : null}

          <div className="panel space-y-3 p-4">
            <h2 className="font-display text-base font-medium text-ink">Actions</h2>
            {canManage ? <button className="btn-secondary w-full justify-center" disabled={cancel.isPending} onClick={onCancel}>Cancel membership</button> : null}
            {canRefund ? <button className="btn-secondary w-full justify-center text-red-700" disabled={refund.isPending} onClick={onRefund}>Mark refunded</button> : null}
            {!canManage && !canRefund ? <p className="text-sm text-paper-600">No management actions are available for your role.</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
