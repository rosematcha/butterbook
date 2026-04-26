'use client';
import { Suspense, useMemo, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { useSession } from '../../../lib/session';
import { Timestamp } from '../../components/timestamp';
import { EmptyState } from '../../components/empty-state';
import { SkeletonRows } from '../../components/skeleton-rows';
import { SettingsBackLink } from '../settings/_components/back-link';

interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_type: string;
  action: string;
  target_type: string;
  target_id: string;
  created_at: string;
  diff: unknown;
}

interface Member {
  memberId: string;
  userId: string;
  email: string;
  displayName: string | null;
}

const ACTIONS = [
  'visit.created', 'visit.updated', 'visit.cancelled', 'visit.no_show', 'visit.pii_redacted', 'visit.intake_checkin',
  'waitlist.joined', 'waitlist.promoted', 'waitlist.removed', 'waitlist.reordered',
  'member.removed', 'member.restored', 'member.role_assigned', 'member.role_removed',
  'member.promoted_superadmin', 'member.demoted_superadmin',
  'role.created', 'role.updated', 'role.deleted', 'role.permissions_replaced',
  'location.created', 'location.updated', 'location.deleted', 'location.restored',
  'location.set_primary', 'location.qr_rotated',
  'contact.created', 'contact.updated', 'contact.pii_redacted',
  'membership.checkout_started', 'membership.cancelled',
  'promo_code.created', 'promo_code.updated', 'promo_code.deleted',
  'guest_pass.issued',
  'sso_provider.created', 'sso_provider.updated', 'sso_provider.deleted',
  'api_key.created', 'api_key.revoked',
  'stripe.connected', 'stripe.disconnected', 'stripe.webhook_processed',
] as const;

const TARGET_TYPES = [
  'visit', 'waitlist_entry', 'member', 'role', 'location', 'visitor',
  'membership', 'promo_code', 'org', 'org_sso_provider', 'api_key',
] as const;

export default function AuditPage() {
  return (
    <Suspense fallback={null}>
      <AuditPageInner />
    </Suspense>
  );
}

function AuditPageInner() {
  const { activeOrgId } = useSession();
  const perms = usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const page = Number(params.get('page') || '1');
  const actorId = params.get('actor_id') || '';
  const action = params.get('action') || '';
  const targetType = params.get('target_type') || '';
  const since = params.get('since') || '';
  const until = params.get('until') || '';
  const limit = 50;

  function setFilter(key: string, value: string) {
    const sp = new URLSearchParams(params.toString());
    if (value) {
      sp.set(key, value);
    } else {
      sp.delete(key);
    }
    if (key !== 'page') sp.set('page', '1');
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  function setPage(p: number) {
    setFilter('page', String(p));
  }

  const queryString = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (actorId) p.set('actor_id', actorId);
    if (action) p.set('action', action);
    if (targetType) p.set('target_type', targetType);
    if (since) p.set('from', new Date(since).toISOString());
    if (until) p.set('to', new Date(`${until}T23:59:59`).toISOString());
    return p.toString();
  }, [page, actorId, action, targetType, since, until]);

  const audit = useQuery({
    queryKey: ['audit', activeOrgId, queryString],
    queryFn: () =>
      apiGet<{ data: AuditRow[]; meta: { total: number; pages: number } }>(
        `/api/v1/orgs/${activeOrgId}/audit?${queryString}`,
      ),
    enabled: !!activeOrgId && perms.isSuperadmin,
  });

  const members = useQuery({
    queryKey: ['members', activeOrgId],
    queryFn: () => apiGet<{ data: Member[] }>(`/api/v1/orgs/${activeOrgId}/members`),
    enabled: !!activeOrgId && perms.isSuperadmin,
    staleTime: 5 * 60_000,
  });

  const memberMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members.data?.data ?? []) {
      map.set(m.userId, m.email);
    }
    return map;
  }, [members.data]);

  const hasFilters = actorId || action || targetType || since || until;

  function clearFilters() {
    router.replace(pathname);
  }

  if (!perms.loading && !perms.isSuperadmin) {
    return (
      <EmptyState
        title="Superadmin only."
        description="Audit log access is restricted to organization superadmins. If you need access, ask an existing superadmin to promote you."
      />
    );
  }

  if (audit.isError) {
    return (
      <EmptyState
        title="Superadmin only."
        description="Audit log access is restricted to organization superadmins. If you need access, ask an existing superadmin to promote you."
      />
    );
  }

  const rows = audit.data?.data ?? [];

  return (
    <div className="space-y-5">
      <SettingsBackLink />
      <div>
        <div className="h-eyebrow">History</div>
        <h1 className="h-display mt-1">Audit log</h1>
      </div>

      <div className="panel flex flex-wrap items-end gap-3 p-3">
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-paper-500">Actor</span>
          <select className="input mt-1 text-xs" value={actorId} onChange={(e) => setFilter('actor_id', e.target.value)}>
            <option value="">All actors</option>
            {(members.data?.data ?? []).map((m) => (
              <option key={m.userId} value={m.userId}>{m.email}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-paper-500">Action</span>
          <select className="input mt-1 text-xs" value={action} onChange={(e) => setFilter('action', e.target.value)}>
            <option value="">All actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-paper-500">Entity</span>
          <select className="input mt-1 text-xs" value={targetType} onChange={(e) => setFilter('target_type', e.target.value)}>
            <option value="">All types</option>
            {TARGET_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-paper-500">Since</span>
          <input type="date" className="input mt-1 text-xs" value={since} onChange={(e) => setFilter('since', e.target.value)} />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-paper-500">Until</span>
          <input type="date" className="input mt-1 text-xs" value={until} onChange={(e) => setFilter('until', e.target.value)} />
        </label>
        {hasFilters ? (
          <button type="button" className="btn-ghost text-xs" onClick={clearFilters}>
            Clear filters
          </button>
        ) : null}
      </div>

      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-paper-200 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-paper-500">
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">Actor</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2">Target</th>
            </tr>
          </thead>
          <tbody>
            {audit.isPending ? <SkeletonRows cols={4} rows={8} /> : null}
            {audit.isSuccess && rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-2">
                  <EmptyState
                    title={hasFilters ? 'No events match those filters.' : 'No events recorded yet.'}
                    description={hasFilters ? 'Try widening the date range or clearing a filter.' : 'Events will appear here as actions are taken in your organization.'}
                  />
                </td>
              </tr>
            ) : null}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-paper-100 align-top">
                <td className="px-4 py-3 tabular-nums text-paper-700">
                  <Timestamp value={r.created_at} />
                </td>
                <td className="px-4 py-3 text-paper-700">
                  <span className="text-xs uppercase tracking-wider text-paper-500">{r.actor_type}</span>
                  {r.actor_id ? (
                    <span className="ml-1 text-xs text-paper-600">
                      {memberMap.get(r.actor_id) ?? r.actor_id.slice(0, 8)}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <code className="rounded bg-paper-100 px-1.5 py-0.5 text-xs text-ink">{r.action}</code>
                </td>
                <td className="px-4 py-3">
                  <code className="text-xs text-paper-600">
                    {r.target_type}:<span className="font-mono">{r.target_id.slice(0, 8)}</span>
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
          className="btn-secondary disabled:opacity-50"
        >
          Prev
        </button>
        <span className="text-sm text-paper-600">
          Page {page} of {audit.data?.meta.pages ?? 1}
          {audit.data ? <span className="ml-2 text-paper-400">· {audit.data.meta.total.toLocaleString()} events</span> : null}
        </span>
        <button
          disabled={page >= (audit.data?.meta.pages ?? 1)}
          onClick={() => setPage(page + 1)}
          className="btn-secondary disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
