'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiGet, apiPost } from '../../../lib/api';
import { useOptimisticMutation } from '../../../lib/mutations';
import { useSession } from '../../../lib/session';
import { useConfirm } from '../../../lib/confirm';
import { useToast } from '../../../lib/toast';
import { SkeletonRows } from '../../components/skeleton-rows';
import { EmptyState } from '../../components/empty-state';
import { BulkActionBar } from '../../components/bulk-action-bar';
import { LocationFilter } from '../../components/location-filter';

interface Visit {
  id: string;
  scheduledAt: string;
  status: string;
  bookingMethod: string;
  piiRedacted: boolean;
  formResponse: Record<string, unknown>;
}

type VisitsResponse = { data: Visit[]; meta: { total: number } };
type BulkResult = { data: Record<string, { ok: boolean; error?: string }> };

function bulkSummary(results: Record<string, { ok: boolean; error?: string }>, action: string): string {
  const entries = Object.values(results);
  const ok = entries.filter((r) => r.ok).length;
  const errors = entries.length - ok;
  if (errors === 0) return `${action} ${ok} visit${ok === 1 ? '' : 's'}`;
  return `${action} ${ok} visit${ok === 1 ? '' : 's'} (${errors} error${errors === 1 ? '' : 's'})`;
}

export default function VisitsPage() {
  const { activeOrgId } = useSession();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [locationId, setLocationId] = useState('');
  const from = new Date(`${date}T00:00:00Z`).toISOString();
  const to = new Date(`${date}T23:59:59Z`).toISOString();
  const locParam = locationId ? `&location_id=${locationId}` : '';
  const listKey = ['visits', activeOrgId, date, locationId] as const;

  const visits = useQuery({
    queryKey: listKey,
    queryFn: () => apiGet<VisitsResponse>(`/api/v1/orgs/${activeOrgId}/visits?from=${from}&to=${to}&limit=200${locParam}`),
    enabled: !!activeOrgId,
  });

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

  const bulkCancel = useMutation({
    mutationFn: (visitIds: string[]) =>
      apiPost<BulkResult>(`/api/v1/orgs/${activeOrgId}/visits/bulk-cancel`, { visitIds }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: listKey });
      setSelected(new Set());
      toast.push({ kind: 'success', message: bulkSummary(res.data, 'Cancelled') });
    },
    onError: () => toast.push({ kind: 'error', message: 'Bulk cancel failed' }),
  });

  const bulkNoShow = useMutation({
    mutationFn: (visitIds: string[]) =>
      apiPost<BulkResult>(`/api/v1/orgs/${activeOrgId}/visits/bulk-no-show`, { visitIds }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: listKey });
      setSelected(new Set());
      toast.push({ kind: 'success', message: bulkSummary(res.data, 'Marked no-show') });
    },
    onError: () => toast.push({ kind: 'error', message: 'Bulk no-show failed' }),
  });

  // Only confirmed visits are eligible for bulk actions
  const confirmableIds = (visits.data?.data ?? []).filter((v) => v.status === 'confirmed').map((v) => v.id);
  const selectedArray = Array.from(selected).filter((id) => confirmableIds.includes(id));

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedArray.length === confirmableIds.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(confirmableIds));
    }
  }

  async function onBulkCancel() {
    if (selectedArray.length === 0) return;
    const ok = await confirm({
      title: `Cancel ${selectedArray.length} visit${selectedArray.length === 1 ? '' : 's'}?`,
      description: 'This will cancel all selected confirmed visits.',
      confirmLabel: 'Cancel visits',
      danger: true,
    });
    if (ok) bulkCancel.mutate(selectedArray);
  }

  async function onBulkNoShow() {
    if (selectedArray.length === 0) return;
    const ok = await confirm({
      title: `Mark ${selectedArray.length} visit${selectedArray.length === 1 ? '' : 's'} as no-show?`,
      description: 'This will mark all selected confirmed visits as no-show.',
      confirmLabel: 'Mark no-show',
      danger: true,
    });
    if (ok) bulkNoShow.mutate(selectedArray);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">Date</label>
        <input
          type="date"
          value={date}
          onChange={(e) => { setDate(e.target.value); setSelected(new Set()); }}
          className="input w-48"
        />
        <LocationFilter value={locationId} onChange={(v) => { setLocationId(v); setSelected(new Set()); }} />
        <span className="text-sm text-slate-500">{visits.data?.meta.total ?? 0} total</span>
      </div>
      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="w-8 py-1">
                {confirmableIds.length > 0 ? (
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-paper-300"
                    checked={selectedArray.length === confirmableIds.length && confirmableIds.length > 0}
                    onChange={toggleAll}
                  />
                ) : null}
              </th>
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
              <SkeletonRows cols={7} rows={6} />
            ) : (visits.data?.data ?? []).length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center">
                <EmptyState
                  title="No visits on this day."
                  description="Pick a different date, or add one from the Today view."
                  className="mx-auto mt-0 text-left"
                />
              </td></tr>
            ) : (
              (visits.data?.data ?? []).map((v) => (
                <tr key={v.id} className={`border-t border-slate-100 ${selected.has(v.id) ? 'bg-brand-accent/5' : ''}`}>
                  <td className="py-2">
                    {v.status === 'confirmed' ? (
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-paper-300"
                        checked={selected.has(v.id)}
                        onChange={() => toggleSelect(v.id)}
                      />
                    ) : null}
                  </td>
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

      <BulkActionBar count={selectedArray.length} onClear={() => setSelected(new Set())}>
        <button
          type="button"
          className="btn-ghost text-xs text-red-700 hover:bg-red-50"
          disabled={bulkCancel.isPending || bulkNoShow.isPending}
          onClick={onBulkCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn-ghost text-xs"
          disabled={bulkCancel.isPending || bulkNoShow.isPending}
          onClick={onBulkNoShow}
        >
          No-show
        </button>
      </BulkActionBar>
    </div>
  );
}
