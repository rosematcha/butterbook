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

  const selected = useMemo(() => (segments.data?.data ?? []).find((s) => s.id === selectedId) ?? null, [segments.data, selectedId]);

  const preview = useQuery({
    queryKey: ['segment-preview', activeOrgId, selectedId],
    queryFn: () => apiPost<{ data: Contact[]; meta: { count: number; previewLimit: number } }>(`/api/v1/orgs/${activeOrgId}/segments/${selectedId}/preview`),
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

  const rows = segments.data?.data ?? [];

  return (
    <div className="space-y-8">
      <div>
        <Link href="/app/contacts" className="text-sm text-paper-600 hover:text-brand-accent">&larr; Contacts</Link>
        <div className="h-eyebrow mt-4">Members & CRM</div>
        <h1 className="h-display mt-1">Segments</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-paper-600">
          Save contact filters for reporting now and future broadcasts when engagement ships.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="panel overflow-hidden">
          {segments.isSuccess && rows.length === 0 ? (
            <EmptyState className="m-6" title="No segments yet." description="Create one from a tag, email domain, visit date, or membership placeholder." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-paper-200 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-paper-500">
                  <th className="px-4 py-2">Segment</th>
                  <th className="px-4 py-2">Filter</th>
                  <th className="px-4 py-2">Contacts</th>
                  <th className="px-4 py-2">Computed</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {segments.isPending ? <SkeletonRows cols={5} rows={5} /> : rows.map((segment) => (
                  <tr key={segment.id} className={`border-t border-paper-100 ${selectedId === segment.id ? 'bg-brand-accent/5' : ''}`}>
                    <td className="px-4 py-3 font-medium text-ink">{segment.name}</td>
                    <td className="px-4 py-3 text-paper-700">{describeFilter(segment.filter)}</td>
                    <td className="px-4 py-3 tabular text-paper-700">{segment.visitorCount ?? '-'}</td>
                    <td className="px-4 py-3 text-paper-600">{segment.lastComputedAt ? <Timestamp value={segment.lastComputedAt} /> : '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <button className="btn-ghost text-xs" onClick={() => edit(segment)}>Edit</button>
                      <button className="btn-ghost text-xs text-red-700 hover:bg-red-50" onClick={() => onDelete(segment)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <aside className="space-y-6">
          <form onSubmit={onSubmit} className="panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-medium text-ink">{selected ? 'Edit segment' : 'Create segment'}</h2>
                <p className="mt-1 text-sm text-paper-600">Phase 1 supports one filter at a time in the UI.</p>
              </div>
              {selected ? <button type="button" className="btn-ghost text-xs" onClick={() => { setSelectedId(null); setName(''); setValue(initialValue(kind)); }}>New</button> : null}
            </div>
            <div className="mt-4 space-y-3">
              <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Segment name" />
              <select className="input" value={kind} onChange={(e) => resetBuilder(e.target.value as FilterKind)}>
                <option value="tag">Tag</option>
                <option value="emailDomain">Email domain</option>
                <option value="visitedAfter">Visited after</option>
                <option value="visitedBefore">Visited before</option>
                <option value="hasMembership">Membership status</option>
              </select>
              {kind === 'hasMembership' ? (
                <select className="input" value={value} onChange={(e) => setValue(e.target.value)}>
                  <option value="false">Does not have membership</option>
                  <option value="true">Has membership</option>
                </select>
              ) : (
                <input
                  className="input"
                  required
                  type={kind === 'visitedAfter' || kind === 'visitedBefore' ? 'date' : 'text'}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={kind === 'emailDomain' ? 'example.org' : 'member'}
                />
              )}
              <button className="btn w-full" disabled={create.isPending || update.isPending}>
                {selected ? 'Update segment' : 'Create segment'}
              </button>
            </div>
          </form>

          <section className="panel p-5">
            <h2 className="font-display text-base font-medium text-ink">Preview</h2>
            {!selected ? (
              <p className="mt-2 text-sm text-paper-600">Select a segment to preview matching contacts.</p>
            ) : preview.isPending ? (
              <div className="mt-3 text-sm text-paper-500">Loading preview...</div>
            ) : (
              <div className="mt-3 space-y-3">
                <div className="text-sm text-paper-600">{preview.data?.meta.count ?? 0} matching contacts</div>
                <ul className="divide-y divide-paper-100">
                  {(preview.data?.data ?? []).slice(0, 8).map((contact) => (
                    <li key={contact.id} className="py-2 text-sm">
                      <Link href={`/app/contacts/profile?id=${contact.id}`} className="font-medium text-ink hover:text-brand-accent">{contactName(contact)}</Link>
                      <div className="text-xs text-paper-500">{contact.email ?? 'PII redacted'}</div>
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
