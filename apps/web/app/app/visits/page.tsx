'use client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiGet, apiPost } from '../../../lib/api';
import { useOptimisticMutation } from '../../../lib/mutations';
import { useSession } from '../../../lib/session';
import { SkeletonRows } from '../../components/skeleton-rows';

interface Visit {
  id: string;
  scheduledAt: string;
  status: string;
  bookingMethod: string;
  piiRedacted: boolean;
  formResponse: Record<string, unknown>;
}

type VisitsResponse = { data: Visit[]; meta: { total: number } };

export default function VisitsPage() {
  const { activeOrgId } = useSession();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const from = new Date(`${date}T00:00:00Z`).toISOString();
  const to = new Date(`${date}T23:59:59Z`).toISOString();
  const listKey = ['visits', activeOrgId, date] as const;

  const visits = useQuery({
    queryKey: listKey,
    queryFn: () => apiGet<VisitsResponse>(`/api/v1/orgs/${activeOrgId}/visits?from=${from}&to=${to}&limit=200`),
    enabled: !!activeOrgId,
  });

  // Patch the single visit's status in the cached list — avoids refetching the
  // entire day's worth of rows just to flip one field, so the button feels
  // instant even on a slow link.
  const patchStatus = (vars: { id: string; status: 'cancelled' | 'no_show' }) =>
    (current: unknown) => {
      const list = current as VisitsResponse | undefined;
      if (!list) return undefined;
      return {
        ...list,
        data: list.data.map((v) => (v.id === vars.id ? { ...v, status: vars.status } : v)),
      };
    };

  const cancel = useOptimisticMutation<{ id: string; status: 'cancelled' }>({
    mutationFn: ({ id }) => apiPost(`/api/v1/orgs/${activeOrgId}/visits/${id}/cancel`),
    queryKeys: [listKey],
    apply: (current, vars) => patchStatus(vars)(current),
    successMessage: 'Visit cancelled',
    errorMessage: 'Could not cancel visit',
  });

  const noShow = useOptimisticMutation<{ id: string; status: 'no_show' }>({
    mutationFn: ({ id }) => apiPost(`/api/v1/orgs/${activeOrgId}/visits/${id}/no-show`),
    queryKeys: [listKey],
    apply: (current, vars) => patchStatus(vars)(current),
    successMessage: 'Marked as no-show',
    errorMessage: 'Could not mark no-show',
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm">Date</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input w-48" />
        <span className="text-sm text-slate-500">{visits.data?.meta.total ?? 0} total</span>
      </div>
      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1">Time</th>
              <th>Name</th>
              <th>Party</th>
              <th>Method</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visits.isPending ? (
              <SkeletonRows cols={6} rows={6} />
            ) : (visits.data?.data ?? []).length === 0 ? (
              <tr><td colSpan={6} className="py-4 text-center text-slate-500">No visits.</td></tr>
            ) : (
              (visits.data?.data ?? []).map((v) => (
                <tr key={v.id} className="border-t border-slate-100">
                  <td className="py-2">{new Date(v.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{v.piiRedacted ? <em className="text-slate-400">[redacted]</em> : String(v.formResponse.name ?? '—')}</td>
                  <td>{String(v.formResponse.party_size ?? '—')}</td>
                  <td>{v.bookingMethod}</td>
                  <td>{v.status}</td>
                  <td className="space-x-3 text-right">
                    {v.status === 'confirmed' ? (
                      <>
                        <button
                          onClick={() => cancel.mutate({ id: v.id, status: 'cancelled' })}
                          disabled={cancel.isPending || noShow.isPending}
                          className="text-xs text-red-600 underline disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => noShow.mutate({ id: v.id, status: 'no_show' })}
                          disabled={cancel.isPending || noShow.isPending}
                          className="text-xs underline disabled:opacity-50"
                        >
                          No-show
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
