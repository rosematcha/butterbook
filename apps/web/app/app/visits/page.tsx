'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiGet, apiPost } from '../../../lib/api';
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

export default function VisitsPage() {
  const { activeOrgId } = useSession();
  const qc = useQueryClient();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const from = new Date(`${date}T00:00:00Z`).toISOString();
  const to = new Date(`${date}T23:59:59Z`).toISOString();

  const visits = useQuery({
    queryKey: ['visits', activeOrgId, date],
    queryFn: () => apiGet<{ data: Visit[]; meta: { total: number } }>(`/api/v1/orgs/${activeOrgId}/visits?from=${from}&to=${to}&limit=200`),
    enabled: !!activeOrgId,
  });

  const cancel = useMutation({
    mutationFn: (id: string) => apiPost(`/api/v1/orgs/${activeOrgId}/visits/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['visits', activeOrgId] }),
  });
  const noShow = useMutation({
    mutationFn: (id: string) => apiPost(`/api/v1/orgs/${activeOrgId}/visits/${id}/no-show`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['visits', activeOrgId] }),
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
                        <button onClick={() => cancel.mutate(v.id)} className="text-xs text-red-600 underline">Cancel</button>
                        <button onClick={() => noShow.mutate(v.id)} className="text-xs underline">No-show</button>
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
