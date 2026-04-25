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

function itemTone(item: TimelineItem): 'visit' | 'waitlist' | 'note' {
  if (item.type === 'visit') return 'visit';
  if (item.type === 'waitlist') return 'waitlist';
  return 'note';
}

function initials(c: Contact): string {
  if (c.piiRedacted) return '—';
  const first = (c.firstName ?? '').trim();
  const last = (c.lastName ?? '').trim();
  if (first || last) return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
  const email = c.email ?? '';
  return email[0]?.toUpperCase() ?? '?';
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
  const tl = timeline.data?.data ?? [];
  const visitCount = tl.filter((i) => i.type === 'visit').length;
  const waitlistCount = tl.filter((i) => i.type === 'waitlist').length;
  const notificationCount = tl.filter((i) => i.type === 'notification').length;

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/app/contacts"
          className="inline-flex items-center gap-1 text-sm text-paper-500 transition hover:text-brand-accent"
        >
          <span aria-hidden>←</span> Contacts
        </Link>

        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span
              aria-hidden
              className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-paper-100 font-display text-xl font-medium tracking-tight-er text-paper-600 ring-1 ring-paper-200"
            >
              {c ? initials(c) : '·'}
            </span>
            <div>
              <div className="h-eyebrow">Contact</div>
              <h1 className="mt-1 font-display text-3xl font-medium tracking-tight-er text-ink sm:text-4xl">
                {c ? contactName(c) : <SkeletonBlock className="h-9 w-72" />}
              </h1>
              {c ? (
                <p className="mt-2 text-sm text-paper-500">
                  Created <Timestamp value={c.createdAt} /> · Updated <Timestamp value={c.updatedAt} />
                  {c.piiRedacted ? <span className="ml-2 italic text-amber-700">PII redacted</span> : null}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRedact}
              className="btn-ghost text-amber-700"
              disabled={redact.isPending || c?.piiRedacted}
            >
              Redact PII
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="btn-ghost text-red-700"
              disabled={remove.isPending}
            >
              Delete
            </button>
          </div>
        </div>

        {c ? (
          <dl className="mt-6 grid gap-px overflow-hidden rounded-lg border border-paper-200 bg-paper-200 sm:grid-cols-3">
            <StatCell label="Visits" value={visitCount} />
            <StatCell label="Waitlist" value={waitlistCount} />
            <StatCell label="Notifications" value={notificationCount} />
          </dl>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <form onSubmit={onSave} className="panel p-6">
          <h2 className="font-display text-lg font-medium tracking-tight-er text-ink">Identity</h2>
          <p className="mt-1 text-sm text-paper-600">
            Contact fields visible everywhere this person appears.
            {c?.piiRedacted ? ' Editing is disabled while this profile is redacted.' : ''}
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="h-eyebrow">Email</span>
              <input
                className="input mt-1"
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                disabled={c?.piiRedacted}
              />
            </label>
            <label className="block">
              <span className="h-eyebrow">Phone</span>
              <input
                className="input mt-1"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                disabled={c?.piiRedacted}
              />
            </label>
            <label className="block">
              <span className="h-eyebrow">First name</span>
              <input
                className="input mt-1"
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                disabled={c?.piiRedacted}
              />
            </label>
            <label className="block">
              <span className="h-eyebrow">Last name</span>
              <input
                className="input mt-1"
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                disabled={c?.piiRedacted}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="h-eyebrow">Tags</span>
              <input
                className="input mt-1"
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                disabled={c?.piiRedacted}
                placeholder="member, donor, school group"
              />
              <span className="mt-1 block text-xs text-paper-500">Comma-separated.</span>
            </label>
            <label className="block sm:col-span-2">
              <span className="h-eyebrow">Notes</span>
              <textarea
                className="input mt-1 min-h-[140px]"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                disabled={c?.piiRedacted}
                placeholder="Anything the next staff member should know."
              />
            </label>
          </div>
          <div className="mt-5 flex justify-end">
            <button className="btn" disabled={save.isPending || c?.piiRedacted}>
              {save.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>

        <aside className="space-y-5">
          <section className="panel p-5">
            <h2 className="font-display text-base font-medium tracking-tight-er text-ink">Tags</h2>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {c?.tags.length
                ? c.tags.map((t) => <span key={t} className="badge-accent">{t}</span>)
                : <span className="text-sm italic text-paper-400">No tags yet.</span>}
            </div>
          </section>

          <section className="panel p-5">
            <h2 className="font-display text-base font-medium tracking-tight-er text-ink">Merge</h2>
            <p className="mt-1 text-sm leading-relaxed text-paper-600">
              Paste another contact ID to merge their visits and waitlist rows here. The other
              contact is soft-deleted.
            </p>
            <form
              className="mt-4 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                merge.mutate();
              }}
            >
              <input
                className="input font-mono text-[12px]"
                required
                value={mergeId}
                onChange={(e) => setMergeId(e.target.value)}
                placeholder="00000000-0000-0000-0000-000000000000"
              />
              <button className="btn-secondary w-full" disabled={merge.isPending || !mergeId.trim()}>
                {merge.isPending ? 'Merging…' : 'Merge into this profile'}
              </button>
            </form>
          </section>
        </aside>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <div className="h-eyebrow">Timeline</div>
            <h2 className="mt-1 font-display text-xl font-medium tracking-tight-er text-ink">
              Activity history
            </h2>
          </div>
          <span className="text-sm tabular-nums text-paper-500">{tl.length} events</span>
        </div>

        {timeline.isPending ? (
          <div className="panel space-y-3 p-5">
            <SkeletonBlock className="h-5 w-2/3" />
            <SkeletonBlock className="h-5 w-1/2" />
            <SkeletonBlock className="h-5 w-3/5" />
          </div>
        ) : tl.length === 0 ? (
          <div className="panel p-8 text-center text-sm italic text-paper-400">
            No activity yet. This profile hasn&rsquo;t booked, joined a waitlist, or received a notification.
          </div>
        ) : (
          <ol className="relative space-y-0 border-l border-paper-200 pl-6">
            {tl.map((item) => {
              const tone = itemTone(item);
              return (
                <li key={`${item.type}-${item.id}`} className="relative pb-5 last:pb-0">
                  <span
                    aria-hidden
                    className={`absolute -left-[31px] top-1 inline-flex h-3 w-3 items-center justify-center rounded-full ring-4 ring-paper-50 ${
                      tone === 'visit'
                        ? 'bg-brand-accent'
                        : tone === 'waitlist'
                        ? 'bg-amber-500'
                        : 'bg-paper-400'
                    }`}
                  />
                  <div className="flex items-start justify-between gap-3 rounded-md border border-paper-100 bg-white px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium capitalize text-ink">{itemLabel(item)}</div>
                      <div className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-paper-500">
                        {item.type}
                      </div>
                    </div>
                    <Timestamp value={item.at} className="shrink-0 text-paper-500" />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white px-5 py-3.5">
      <div className="h-eyebrow">{label}</div>
      <div className="mt-1 font-display text-2xl font-medium tabular-nums tracking-tight-er text-ink">
        {value}
      </div>
    </div>
  );
}
