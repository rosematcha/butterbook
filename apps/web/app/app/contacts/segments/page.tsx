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

type FilterKind = 'tag' | 'emailDomain' | 'visitedAfter' | 'visitedBefore' | 'hasMembership';

const FILTER_KINDS: Array<{ value: FilterKind; label: string }> = [
  { value: 'tag', label: 'Tag' },
  { value: 'emailDomain', label: 'Email domain' },
  { value: 'visitedAfter', label: 'Visited after' },
  { value: 'visitedBefore', label: 'Visited before' },
  { value: 'hasMembership', label: 'Membership' },
];

function apiErrMsg(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.problem.detail ?? e.problem.title : fallback;
}

function makeFilter(kind: FilterKind, value: string): SegmentFilter {
  if (kind === 'hasMembership') return { hasMembership: value === 'true' };
  if (kind === 'visitedAfter') return { visitedAfter: new Date(`${value}T00:00:00`).toISOString() };
  if (kind === 'visitedBefore') return { visitedBefore: new Date(`${value}T23:59:59`).toISOString() };
  if (kind === 'emailDomain') return { emailDomain: value.trim().replace(/^@/, '') };
  return { tag: value.trim() };
}

function initialValue(kind: FilterKind): string {
  if (kind === 'hasMembership') return 'false';
  if (kind === 'visitedAfter' || kind === 'visitedBefore') return new Date().toISOString().slice(0, 10);
  return '';
}

export default function SegmentsPage() {
  const { activeOrgId } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<FilterKind>('tag');
  const [value, setValue] = useState('');

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
        filter: makeFilter(kind, value),
      }),
    onSuccess: (res) => {
      setName('');
      setValue(initialValue(kind));
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
        filter: makeFilter(kind, value),
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

  function resetBuilder(nextKind: FilterKind) {
    setKind(nextKind);
    setValue(initialValue(nextKind));
  }

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
    const f = segment.filter;
    if ('tag' in f) { resetBuilder('tag'); setValue(f.tag); }
    else if ('emailDomain' in f) { resetBuilder('emailDomain'); setValue(f.emailDomain); }
    else if ('visitedAfter' in f) { resetBuilder('visitedAfter'); setValue(f.visitedAfter.slice(0, 10)); }
    else if ('visitedBefore' in f) { resetBuilder('visitedBefore'); setValue(f.visitedBefore.slice(0, 10)); }
    else if ('hasMembership' in f) { resetBuilder('hasMembership'); setValue(String(f.hasMembership)); }
    else {
      resetBuilder('tag');
      setValue('');
    }
  }

  function newSegment() {
    setSelectedId(null);
    setName('');
    resetBuilder('tag');
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
              Saved contact filters. Useful for reports today; the foundation for broadcasts later.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm tabular-nums text-paper-500">{rows.length} saved</span>
            <button type="button" className="btn" onClick={newSegment}>New segment</button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="panel overflow-hidden">
          {segments.isSuccess && rows.length === 0 ? (
            <EmptyState
              className="m-6"
              title="No segments yet."
              description="Build one from a tag, email domain, visit date, or membership status. Save it for reuse."
            />
          ) : (
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
                        <td className="px-5 py-3.5 text-paper-700">{describeFilter(segment.filter)}</td>
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
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {FILTER_KINDS.map((f) => {
                    const active = kind === f.value;
                    return (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => resetBuilder(f.value)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                          active
                            ? 'bg-ink text-paper-50'
                            : 'bg-paper-100 text-paper-600 hover:bg-paper-200 hover:text-ink'
                        }`}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="block">
                <span className="h-eyebrow">
                  {kind === 'tag' ? 'Tag' :
                    kind === 'emailDomain' ? 'Domain' :
                    kind === 'visitedAfter' ? 'Date (after)' :
                    kind === 'visitedBefore' ? 'Date (before)' : 'Status'}
                </span>
                {kind === 'hasMembership' ? (
                  <select className="input mt-1" value={value} onChange={(e) => setValue(e.target.value)}>
                    <option value="false">Does not have membership</option>
                    <option value="true">Has membership</option>
                  </select>
                ) : (
                  <input
                    className="input mt-1"
                    required
                    type={kind === 'visitedAfter' || kind === 'visitedBefore' ? 'date' : 'text'}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={kind === 'emailDomain' ? 'example.org' : kind === 'tag' ? 'member' : ''}
                  />
                )}
              </label>

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
