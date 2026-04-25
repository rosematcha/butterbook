'use client';
import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import { useToast } from '../../../../lib/toast';
import { useConfirm } from '../../../../lib/confirm';
import { EmptyState } from '../../../components/empty-state';
import { SkeletonRows } from '../../../components/skeleton-rows';
import { Timestamp } from '../../../components/timestamp';
import { contactName, describeFilter, type Contact, type Segment, type SegmentFilter } from '../types';
import { RuleBuilder, simplify } from './rule-builder';

function apiErrMsg(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.problem.detail ?? e.problem.title : fallback;
}

const EMPTY_FILTER: SegmentFilter = { and: [{ tag: '' }] };

export default function SegmentsPage() {
  const { activeOrgId } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [filter, setFilter] = useState<SegmentFilter>(EMPTY_FILTER);

  const segments = useQuery({
    queryKey: ['segments', activeOrgId],
    queryFn: () => apiGet<{ data: Segment[] }>(`/api/v1/orgs/${activeOrgId}/segments`),
    enabled: !!activeOrgId,
  });

  const selected = useMemo(
    () => (segments.data?.data ?? []).find((s) => s.id === selectedId) ?? null,
    [segments.data, selectedId],
  );

  const preview = useQuery({
    queryKey: ['segment-preview', activeOrgId, selectedId],
    queryFn: () =>
      apiPost<{ data: Contact[]; meta: { count: number; previewLimit: number } }>(
        `/api/v1/orgs/${activeOrgId}/segments/${selectedId}/preview`,
      ),
    enabled: !!activeOrgId && !!selectedId,
  });

  const create = useMutation({
    mutationFn: () =>
      apiPost<{ data: Segment }>(`/api/v1/orgs/${activeOrgId}/segments`, {
        name,
        filter: simplify(filter),
      }),
    onSuccess: (res) => {
      setName('');
      setFilter(EMPTY_FILTER);
      setSelectedId(res.data.id);
      qc.invalidateQueries({ queryKey: ['segments', activeOrgId] });
      toast.push({ kind: 'success', message: 'Segment created' });
    },
    onError: (e) => toast.push({ kind: 'error', message: apiErrMsg(e, 'Segment could not be created') }),
  });

  const update = useMutation({
    mutationFn: () =>
      apiPatch<{ data: Segment }>(`/api/v1/orgs/${activeOrgId}/segments/${selectedId}`, {
        name: name || selected?.name,
        filter: simplify(filter),
      }),
    onSuccess: (res) => {
      setSelectedId(res.data.id);
      qc.invalidateQueries({ queryKey: ['segments', activeOrgId] });
      qc.invalidateQueries({ queryKey: ['segment-preview', activeOrgId, selectedId] });
      toast.push({ kind: 'success', message: 'Segment updated' });
    },
    onError: (e) => toast.push({ kind: 'error', message: apiErrMsg(e, 'Segment could not be updated') }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/v1/orgs/${activeOrgId}/segments/${id}`),
    onSuccess: (_, id) => {
      if (selectedId === id) setSelectedId(null);
      qc.invalidateQueries({ queryKey: ['segments', activeOrgId] });
      toast.push({ kind: 'success', message: 'Segment deleted' });
    },
    onError: (e) => toast.push({ kind: 'error', message: apiErrMsg(e, 'Delete failed') }),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (selected) update.mutate();
    else create.mutate();
  }

  async function onDelete(segment: Segment) {
    const ok = await confirm({
      title: `Delete ${segment.name}?`,
      description: 'The saved filter will be removed. Contacts are not changed.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) remove.mutate(segment.id);
  }

  function edit(segment: Segment) {
    setSelectedId(segment.id);
    setName(segment.name);
    setFilter(segment.filter);
  }

  function newSegment() {
    setSelectedId(null);
    setName('');
    setFilter(EMPTY_FILTER);
  }

  const rows = segments.data?.data ?? [];

  return (
    <div>
      <div className="mb-8">
        <Link href="/app/contacts" className="inline-flex items-center gap-1 text-sm text-paper-500 transition hover:text-brand-accent">
          <span aria-hidden>←</span> Contacts
        </Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="h-eyebrow">Members &amp; CRM</div>
            <h1 className="h-display mt-1">Segments</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-paper-600">
              Saved contact filters. Combine rules with All/Any and nest groups for compound logic.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm tabular-nums text-paper-500">{rows.length} saved</span>
            <button type="button" className="btn" onClick={newSegment}>New segment</button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
        <section className="panel overflow-hidden">
          {segments.isSuccess && rows.length === 0 ? (
            <EmptyState
              className="m-6"
              title="No segments yet."
              description="Build one from a tag, email domain, visit date, or membership status. Combine rules to build something more specific."
            />
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-paper-200 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-paper-500">
                  <th className="px-5 py-3">Segment</th>
                  <th className="px-5 py-3">Filter</th>
                  <th className="px-5 py-3">Contacts</th>
                  <th className="px-5 py-3">Computed</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {segments.isPending
                  ? <SkeletonRows cols={5} rows={5} />
                  : rows.map((segment) => {
                    const isSelected = selectedId === segment.id;
                    return (
                      <tr
                        key={segment.id}
                        className={`group cursor-pointer border-t border-paper-100 transition ${
                          isSelected ? 'bg-brand-accent/5' : 'hover:bg-paper-50/70'
                        }`}
                        onClick={() => edit(segment)}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            {isSelected ? (
                              <span aria-hidden className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand-accent" />
                            ) : null}
                            <span className="font-medium text-ink">{segment.name}</span>
                          </div>
                        </td>
                        <td className="max-w-[28rem] truncate px-5 py-3.5 text-paper-700" title={describeFilter(segment.filter)}>
                          {describeFilter(segment.filter)}
                        </td>
                        <td className="px-5 py-3.5 tabular-nums text-paper-700">
                          {segment.visitorCount ?? <span className="text-paper-400">—</span>}
                        </td>
                        <td className="px-5 py-3.5 text-paper-600">
                          {segment.lastComputedAt
                            ? <Timestamp value={segment.lastComputedAt} />
                            : <span className="text-paper-400">Never</span>}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            className="btn-ghost text-xs"
                            onClick={(e) => { e.stopPropagation(); edit(segment); }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn-ghost text-xs text-red-700 hover:bg-red-50"
                            onClick={(e) => { e.stopPropagation(); onDelete(segment); }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <form onSubmit={onSubmit} className="panel p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="h-eyebrow">{selected ? 'Editing' : 'Creating'}</div>
                <h2 className="mt-1 font-display text-lg font-medium tracking-tight-er text-ink">
                  {selected ? selected.name : 'New segment'}
                </h2>
              </div>
              {selected ? (
                <button type="button" className="btn-ghost text-xs" onClick={newSegment}>New</button>
              ) : null}
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="h-eyebrow">Name</span>
                <input
                  className="input mt-1"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Lapsed donors"
                />
              </label>

              <div>
                <span className="h-eyebrow">Filter</span>
                <div className="mt-2">
                  <RuleBuilder filter={filter} onChange={setFilter} />
                </div>
                <p className="mt-2 text-[11px] text-paper-500">
                  Date filters use your local browser timezone for the start and end of day.
                </p>
              </div>

              <button className="btn w-full" disabled={create.isPending || update.isPending}>
                {selected
                  ? (update.isPending ? 'Saving…' : 'Save segment')
                  : (create.isPending ? 'Creating…' : 'Create segment')}
              </button>
            </div>
          </form>

          <section className="panel p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-medium tracking-tight-er text-ink">Preview</h2>
              {selected && preview.data ? (
                <span className="font-display text-2xl font-medium tracking-tight-er tabular-nums text-ink">
                  {preview.data.meta.count}
                </span>
              ) : null}
            </div>

            {!selected ? (
              <p className="mt-2 text-sm italic text-paper-400">
                Select or save a segment to see matching contacts.
              </p>
            ) : preview.isPending ? (
              <div className="mt-3 text-sm text-paper-500">Loading…</div>
            ) : preview.data?.meta.count === 0 ? (
              <p className="mt-2 text-sm italic text-paper-500">No contacts match yet.</p>
            ) : (
              <div className="mt-3">
                <p className="text-xs text-paper-500">
                  Showing first {Math.min(8, preview.data?.data.length ?? 0)} of {preview.data?.meta.count}.
                </p>
                <ul className="mt-2 divide-y divide-paper-100">
                  {(preview.data?.data ?? []).slice(0, 8).map((contact) => (
                    <li key={contact.id} className="py-2.5 text-sm">
                      <Link
                        href={`/app/contacts/profile?id=${contact.id}`}
                        className="font-medium text-ink hover:text-brand-accent"
                      >
                        {contactName(contact)}
                      </Link>
                      <div className="text-xs text-paper-500">
                        {contact.email ?? <span className="italic">PII redacted</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
