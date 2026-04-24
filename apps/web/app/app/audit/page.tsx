'use client';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { useSession } from '../../../lib/session';
import { Timestamp } from '../../components/timestamp';
import { EmptyState } from '../../components/empty-state';
import { SkeletonRows } from '../../components/skeleton-rows';

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

export default function AuditPage() {
  const { activeOrgId } = useSession();
  const perms = usePermissions();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const limit = 50;

  const audit = useQuery({
    queryKey: ['audit', activeOrgId, page],
    queryFn: () =>
      apiGet<{ data: AuditRow[]; meta: { total: number; pages: number } }>(
        `/api/v1/orgs/${activeOrgId}/audit?page=${page}&limit=${limit}`,
      ),
    // Gate the fetch on permissions so a non-superadmin never fires a doomed
    // request that would 403 a second later and flash the denied state.
    enabled: !!activeOrgId && perms.isSuperadmin,
  });

  const filtered = useMemo(() => {
    const rows = audit.data?.data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      `${r.action} ${r.actor_type} ${r.target_type} ${r.actor_id ?? ''} ${r.target_id}`
        .toLowerCase()
        .includes(needle),
    );
  }, [audit.data?.data, q]);

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

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="h-eyebrow">History</div>
          <h1 className="h-display mt-1">Audit log</h1>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter by actor, action, or target…"
          className="input max-w-xs"
        />
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
            {audit.isSuccess && filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-paper-500">
                  {q ? 'No rows match that filter.' : 'No events recorded on this page.'}
                </td>
              </tr>
            ) : null}
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-paper-100 align-top">
                <td className="px-4 py-3 tabular-nums text-paper-700">
                  <Timestamp value={r.created_at} />
                </td>
                <td className="px-4 py-3 text-paper-700">
                  <span className="text-xs uppercase tracking-wider text-paper-500">{r.actor_type}</span>
                  {r.actor_id ? <span className="ml-1 font-mono text-xs text-paper-600">{r.actor_id.slice(0, 8)}</span> : null}
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
          onClick={() => setPage((p) => p - 1)}
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
          onClick={() => setPage((p) => p + 1)}
          className="btn-secondary disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
