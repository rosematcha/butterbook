'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from '../../../../lib/api';
import { useSession } from '../../../../lib/session';
import { useToast } from '../../../../lib/toast';
import { useConfirm } from '../../../../lib/confirm';
import { SkeletonBlock } from '../../../components/skeleton-rows';
import { Timestamp } from '../../../components/timestamp';
import { contactName, tagsFromText, type Contact, type TimelineItem } from '../types';

function apiErrMsg(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.problem.detail ?? e.problem.title : fallback;
}

function itemLabel(item: TimelineItem): string {
  if (item.type === 'visit') return `${item.status} ${item.bookingMethod} visit`;
  if (item.type === 'waitlist') return `${item.status} waitlist entry`;
  return `${item.status} ${item.templateKey}`;
}

export default function ContactProfilePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { activeOrgId } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const contactId = searchParams.get('id') ?? '';
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', phone: '', tags: '', notes: '' });
  const [mergeId, setMergeId] = useState('');

  const contact = useQuery({
    queryKey: ['contact', activeOrgId, contactId],
    queryFn: () => apiGet<{ data: Contact }>(`/api/v1/orgs/${activeOrgId}/contacts/${contactId}`),
    enabled: !!activeOrgId && contactId.length > 0,
  });
  const timeline = useQuery({
    queryKey: ['contact-timeline', activeOrgId, contactId],
    queryFn: () => apiGet<{ data: TimelineItem[] }>(`/api/v1/orgs/${activeOrgId}/contacts/${contactId}/timeline`),
    enabled: !!activeOrgId && contactId.length > 0,
  });

  useEffect(() => {
    const c = contact.data?.data;
    if (!c) return;
    setForm({
      email: c.email ?? '',
      firstName: c.firstName ?? '',
      lastName: c.lastName ?? '',
      phone: c.phone ?? '',
      tags: c.tags.join(', '),
      notes: c.notes ?? '',
    });
  }, [contact.data]);

  const save = useMutation({
    mutationFn: () =>
      apiPatch<{ data: Contact }>(`/api/v1/orgs/${activeOrgId}/contacts/${contactId}`, {
        email: form.email,
        firstName: form.firstName.trim() || null,
        lastName: form.lastName.trim() || null,
        phone: form.phone.trim() || null,
        tags: tagsFromText(form.tags),
        notes: form.notes.trim() || null,
      }),
    onSuccess: (res) => {
      qc.setQueryData(['contact', activeOrgId, contactId], { data: res.data });
      qc.invalidateQueries({ queryKey: ['contacts', activeOrgId] });
      toast.push({ kind: 'success', message: 'Contact saved' });
    },
    onError: (e) => toast.push({ kind: 'error', message: apiErrMsg(e, 'Contact could not be saved') }),
  });

  const merge = useMutation({
    mutationFn: () =>
      apiPost(`/api/v1/orgs/${activeOrgId}/contacts/merge`, {
        keepId: contactId,
        mergeIds: [mergeId.trim()],
      }),
    onSuccess: () => {
      setMergeId('');
      qc.invalidateQueries({ queryKey: ['contact', activeOrgId, contactId] });
      qc.invalidateQueries({ queryKey: ['contact-timeline', activeOrgId, contactId] });
      qc.invalidateQueries({ queryKey: ['contacts', activeOrgId] });
      toast.push({ kind: 'success', message: 'Contacts merged' });
    },
    onError: (e) => toast.push({ kind: 'error', message: apiErrMsg(e, 'Merge failed') }),
  });

  const remove = useMutation({
    mutationFn: () => apiDelete(`/api/v1/orgs/${activeOrgId}/contacts/${contactId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts', activeOrgId] });
      router.push('/app/contacts');
      toast.push({ kind: 'success', message: 'Contact deleted' });
    },
    onError: (e) => toast.push({ kind: 'error', message: apiErrMsg(e, 'Delete failed') }),
  });

  const redact = useMutation({
    mutationFn: () => apiPost(`/api/v1/orgs/${activeOrgId}/contacts/${contactId}/redact`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact', activeOrgId, contactId] });
      qc.invalidateQueries({ queryKey: ['contacts', activeOrgId] });
      toast.push({ kind: 'success', message: 'PII redacted' });
    },
    onError: (e) => toast.push({ kind: 'error', message: apiErrMsg(e, 'Redaction failed') }),
  });

  async function onDelete() {
    const ok = await confirm({
      title: 'Delete this contact?',
      description: 'The contact will be soft-deleted. Linked visits and waitlist history stay in place.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) remove.mutate();
  }

  async function onRedact() {
    const ok = await confirm({
      title: 'Redact this contact?',
      description: 'Email, phone, address, notes, and tags will be scrubbed. This cannot be undone from the UI.',
      confirmLabel: 'Redact PII',
      danger: true,
    });
    if (ok) redact.mutate();
  }

  function onSave(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  const c = contact.data?.data;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/app/contacts" className="text-sm text-paper-600 hover:text-brand-accent">&larr; Contacts</Link>
          <div className="h-eyebrow mt-4">Contact profile</div>
          <h1 className="h-display mt-1">{c ? contactName(c) : <SkeletonBlock className="h-9 w-72" />}</h1>
          {c ? <p className="mt-2 text-sm text-paper-600">Created <Timestamp value={c.createdAt} /> &middot; Updated <Timestamp value={c.updatedAt} /></p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onRedact} className="btn-secondary text-red-700" disabled={redact.isPending || c?.piiRedacted}>
            Redact PII
          </button>
          <button type="button" onClick={onDelete} className="btn-danger" disabled={remove.isPending}>
            Delete
          </button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <form onSubmit={onSave} className="panel p-5">
          <h2 className="font-display text-base font-medium text-ink">Identity</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-paper-600">Email</span>
              <input className="input" required type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} disabled={c?.piiRedacted} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-paper-600">Phone</span>
              <input className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} disabled={c?.piiRedacted} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-paper-600">First name</span>
              <input className="input" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} disabled={c?.piiRedacted} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-paper-600">Last name</span>
              <input className="input" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} disabled={c?.piiRedacted} />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block text-paper-600">Tags</span>
              <input className="input" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} disabled={c?.piiRedacted} placeholder="member, donor, school group" />
            </label>
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block text-paper-600">Notes</span>
              <textarea className="input min-h-32" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} disabled={c?.piiRedacted} />
            </label>
          </div>
          <div className="mt-4 flex justify-end">
            <button className="btn" disabled={save.isPending || c?.piiRedacted}>{save.isPending ? 'Saving...' : 'Save changes'}</button>
          </div>
        </form>

        <aside className="space-y-6">
          <section className="panel p-5">
            <h2 className="font-display text-base font-medium text-ink">Tags</h2>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {c?.tags.length ? c.tags.map((t) => <span key={t} className="badge-accent">{t}</span>) : <span className="text-sm text-paper-500">No tags yet.</span>}
            </div>
          </section>

          <section className="panel p-5">
            <h2 className="font-display text-base font-medium text-ink">Merge</h2>
            <p className="mt-1 text-sm text-paper-600">Paste another contact ID to move its visits and waitlist rows into this profile.</p>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                merge.mutate();
              }}
            >
              <input className="input" required value={mergeId} onChange={(e) => setMergeId(e.target.value)} placeholder="Contact UUID" />
              <button className="btn-secondary" disabled={merge.isPending}>Merge</button>
            </form>
          </section>
        </aside>
      </div>

      <section>
        <div className="h-eyebrow">Timeline</div>
        <div className="panel mt-3 divide-y divide-paper-100">
          {timeline.isPending ? (
            <div className="space-y-3 p-4">
              <SkeletonBlock className="h-5 w-2/3" />
              <SkeletonBlock className="h-5 w-1/2" />
              <SkeletonBlock className="h-5 w-3/5" />
            </div>
          ) : (timeline.data?.data ?? []).length === 0 ? (
            <div className="p-5 text-sm text-paper-500">No timeline activity yet.</div>
          ) : (
            (timeline.data?.data ?? []).map((item) => (
              <div key={`${item.type}-${item.id}`} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <div>
                  <div className="font-medium text-ink">{itemLabel(item)}</div>
                  <div className="text-xs text-paper-500">{item.type}</div>
                </div>
                <Timestamp value={item.at} className="shrink-0 text-paper-600" />
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
