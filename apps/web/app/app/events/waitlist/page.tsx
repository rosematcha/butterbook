'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPost } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import { EmptyState } from '../../../components/empty-state';

interface WaitlistEntry {
  id: string;
  form_response: Record<string, unknown>;
  sort_order: number;
  status: 'waiting' | 'promoted' | 'removed';
  created_at: string;
}

function WaitlistInner() {
  const search = useSearchParams();
  const id = search.get('id') ?? '';
  const { activeOrgId } = useSession();
  const qc = useQueryClient();

  const waitlist = useQuery({
    queryKey: ['waitlist', activeOrgId, id],
    queryFn: () => apiGet<{ data: WaitlistEntry[] }>(`/api/v1/orgs/${activeOrgId}/events/${id}/waitlist`),
    enabled: !!activeOrgId && !!id,
  });

  const promote = useMutation({
    mutationFn: (entryId: string) => apiPost(`/api/v1/orgs/${activeOrgId}/events/${id}/waitlist/${entryId}/promote`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['waitlist', activeOrgId, id] }),
  });
  const remove = useMutation({
    mutationFn: (entryId: string) => apiDelete(`/api/v1/orgs/${activeOrgId}/events/${id}/waitlist/${entryId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['waitlist', activeOrgId, id] }),
  });

  if (!id) return <p className="text-sm text-red-600">Missing event id.</p>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Waitlist</h2>
      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1">Name</th>
              <th>Party</th>
              <th>Status</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(waitlist.data?.data ?? []).map((w) => (
              <tr key={w.id} className="border-t border-slate-100">
                <td className="py-2">{String(w.form_response.name ?? '—')}</td>
                <td>{String(w.form_response.party_size ?? '—')}</td>
                <td>{w.status}</td>
                <td>{new Date(w.created_at).toLocaleString()}</td>
                <td className="space-x-3 text-right">
                  {w.status === 'waiting' ? (
                    <>
                      <button onClick={() => promote.mutate(w.id)} className="text-xs underline">Promote</button>
                      <button onClick={() => remove.mutate(w.id)} className="text-xs text-red-600 underline">Remove</button>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
            {waitlist.data && waitlist.data.data.length === 0 ? (
              <tr><td colSpan={5} className="py-2"><EmptyState title="No waitlist entries." description="Visitors will appear here when the event reaches capacity." /></td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function WaitlistPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
      <WaitlistInner />
    </Suspense>
  );
}
