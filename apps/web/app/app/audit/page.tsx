'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../../lib/api';
import { useSession } from '../../../lib/session';

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
  const [page, setPage] = useState(1);
  const limit = 50;

  const audit = useQuery({
    queryKey: ['audit', activeOrgId, page],
    queryFn: () => apiGet<{ data: AuditRow[]; meta: { total: number; pages: number } }>(`/api/v1/orgs/${activeOrgId}/audit?page=${page}&limit=${limit}`),
    enabled: !!activeOrgId,
  });

  if (audit.isError) {
    return <p className="text-sm text-red-600">Audit log requires superadmin access.</p>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Audit log</h2>
      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1">When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            {(audit.data?.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-slate-100 align-top">
                <td className="py-2 tabular-nums">{new Date(r.created_at).toLocaleString()}</td>
                <td>{r.actor_type}{r.actor_id ? ` ${r.actor_id.slice(0, 8)}…` : ''}</td>
                <td><code>{r.action}</code></td>
                <td><code>{r.target_type}:{r.target_id.slice(0, 8)}…</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-secondary disabled:opacity-50">Prev</button>
        <span className="text-sm text-slate-600">Page {page} of {audit.data?.meta.pages ?? 1}</span>
        <button disabled={page >= (audit.data?.meta.pages ?? 1)} onClick={() => setPage((p) => p + 1)} className="btn-secondary disabled:opacity-50">Next</button>
      </div>
    </div>
  );
}
