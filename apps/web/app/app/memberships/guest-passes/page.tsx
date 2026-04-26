'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiDelete } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import { useToast } from '../../../../lib/toast';
import { EmptyState } from '../../../components/empty-state';
import { SkeletonRows } from '../../../components/skeleton-rows';
import { Timestamp } from '../../../components/timestamp';
import { MembershipsTabs } from '../_components/tabs';

interface GuestPass {
  id: string;
  membershipId: string;
  code: string;
  issuedAt: string;
  expiresAt: string | null;
  redeemedAt: string | null;
  redeemedByVisitId: string | null;
}

type GuestPassListResponse = {
  data: GuestPass[];
  meta: { page: number; limit: number; total: number; pages: number };
};

type Filter = 'all' | 'unused' | 'redeemed';

export default function GuestPassesPage() {
  const { activeOrgId } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);

  const query = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), limit: '50' });
    if (filter === 'unused') p.set('redeemed', 'false');
    if (filter === 'redeemed') p.set('redeemed', 'true');
    return p.toString();
  }, [page, filter]);

  const passes = useQuery({
    queryKey: ['guest-passes', activeOrgId, query],
    queryFn: () => apiGet<GuestPassListResponse>(`/api/v1/orgs/${activeOrgId}/guest-passes?${query}`),
    enabled: !!activeOrgId,
  });

  const revoke = useMutation({
    mutationFn: (passId: string) => apiDelete(`/api/v1/orgs/${activeOrgId}/guest-passes/${passId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['guest-passes', activeOrgId] });
      toast.push({ kind: 'success', message: 'Pass revoked' });
    },
    onError: (e) => {
      toast.push({ kind: 'error', message: e instanceof Error ? e.message : 'Could not revoke pass' });
    },
  });

  const rows = passes.data?.data ?? [];
  const meta = passes.data?.meta;

  function passStatus(p: GuestPass): { label: string; className: string } {
    if (p.redeemedAt) return { label: 'Redeemed', className: 'badge' };
    if (p.expiresAt && new Date(p.expiresAt) < new Date()) return { label: 'Expired', className: 'badge' };
    return { label: 'Active', className: 'badge-accent' };
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-eyebrow">Members &amp; CRM</div>
          <h1 className="h-display mt-1">Guest passes</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-paper-600">
            Passes issued to members for their guests. Redeemed at the kiosk via code entry.
          </p>
        </div>
      </div>

      <MembershipsTabs />

      <div className="mb-4 flex items-center gap-2">
        {(['all', 'unused', 'redeemed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1); }}
            className={filter === f ? 'btn-secondary' : 'btn-ghost'}
          >
            {f === 'all' ? 'All' : f === 'unused' ? 'Unused' : 'Redeemed'}
          </button>
        ))}
      </div>

      {passes.isSuccess && rows.length === 0 ? (
        <EmptyState
          title={filter !== 'all' ? 'No passes match this filter.' : 'No guest passes yet.'}
          description={filter !== 'all'
            ? 'Try a different filter or wait for passes to be issued.'
            : 'Guest passes are issued automatically when a membership tier includes them.'}
        />
      ) : (
        <section className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-paper-200 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-paper-500">
                  <th className="px-5 py-3">Code</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Issued</th>
                  <th className="px-5 py-3">Expires</th>
                  <th className="px-5 py-3">Redeemed</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {passes.isPending ? (
                  <SkeletonRows cols={6} rows={8} />
                ) : (
                  rows.map((p) => {
                    const s = passStatus(p);
                    const canRevoke = !p.redeemedAt && !(p.expiresAt && new Date(p.expiresAt) < new Date());
                    return (
                      <tr key={p.id} className="border-t border-paper-100 transition hover:bg-paper-50/70">
                        <td className="px-5 py-3.5 font-mono text-xs">{p.code}</td>
                        <td className="px-5 py-3.5"><span className={s.className}>{s.label}</span></td>
                        <td className="px-5 py-3.5 text-paper-600"><Timestamp value={p.issuedAt} /></td>
                        <td className="px-5 py-3.5 text-paper-600">
                          {p.expiresAt ? <Timestamp value={p.expiresAt} /> : <span className="text-paper-400">Never</span>}
                        </td>
                        <td className="px-5 py-3.5 text-paper-600">
                          {p.redeemedAt ? <Timestamp value={p.redeemedAt} /> : <span className="text-paper-400">&mdash;</span>}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {canRevoke ? (
                            <button
                              onClick={() => revoke.mutate(p.id)}
                              disabled={revoke.isPending}
                              className="text-xs text-red-600 underline underline-offset-2 transition hover:text-red-800 disabled:opacity-50"
                            >
                              Revoke
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {meta && meta.pages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-paper-600">
          <span className="tabular-nums">{meta.total} passes</span>
          <div className="flex items-center gap-2">
            <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              &larr; Previous
            </button>
            <span className="tabular-nums">Page {meta.page} of {meta.pages}</span>
            <button className="btn-ghost" disabled={page >= meta.pages} onClick={() => setPage((p) => p + 1)}>
              Next &rarr;
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
