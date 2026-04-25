'use client';
import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, ApiError } from '../../../lib/api';
import { useSession } from '../../../lib/session';
import { useToast } from '../../../lib/toast';
import { EmptyState } from '../../components/empty-state';
import { SkeletonRows } from '../../components/skeleton-rows';
import { Timestamp } from '../../components/timestamp';
import { contactName, tagsFromText, type Contact, type ContactListResponse } from './types';

function apiErrMsg(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.problem.detail ?? e.problem.title : fallback;
}

function initials(c: Contact): string {
  if (c.piiRedacted) return '—';
  const first = (c.firstName ?? '').trim();
  const last = (c.lastName ?? '').trim();
  if (first || last) return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
  const email = c.email ?? '';
  return email[0]?.toUpperCase() ?? '?';
}

export default function ContactsPage() {
  const { activeOrgId } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [newContact, setNewContact] = useState({ email: '', firstName: '', lastName: '', tags: '' });

  const query = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), limit: '50' });
    if (q.trim()) p.set('q', q.trim());
    if (tag.trim()) p.set('tag', tag.trim());
    return p.toString();
  }, [page, q, tag]);

  const contacts = useQuery({
    queryKey: ['contacts', activeOrgId, query],
    queryFn: () => apiGet<ContactListResponse>(`/api/v1/orgs/${activeOrgId}/contacts?${query}`),
    enabled: !!activeOrgId,
  });

  const create = useMutation({
    mutationFn: () =>
      apiPost<{ data: Contact }>(`/api/v1/orgs/${activeOrgId}/contacts`, {
        email: newContact.email,
        firstName: newContact.firstName.trim() || undefined,
        lastName: newContact.lastName.trim() || undefined,
        tags: tagsFromText(newContact.tags),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['contacts', activeOrgId] });
      setNewContact({ email: '', firstName: '', lastName: '', tags: '' });
      setAddOpen(false);
      toast.push({ kind: 'success', message: 'Contact created', description: res.data.email ?? undefined });
    },
    onError: (e) => toast.push({ kind: 'error', message: apiErrMsg(e, 'Contact could not be created') }),
  });

  function onCreate(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  const rows = contacts.data?.data ?? [];
  const meta = contacts.data?.meta;
  const filtered = q.trim() || tag.trim();

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-eyebrow">Members &amp; CRM</div>
          <h1 className="h-display mt-1">Contacts</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-paper-600">
            Records from bookings, kiosk check-ins, waitlists, and manual entries. Searchable and
            taggable.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/app/contacts/segments" className="btn-ghost">Segments</Link>
          <button type="button" className={addOpen ? 'btn-secondary' : 'btn'} onClick={() => setAddOpen((v) => !v)}>
            {addOpen ? 'Close' : 'Add contact'}
          </button>
        </div>
      </div>

      {addOpen ? (
        <form onSubmit={onCreate} className="panel mb-6 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-medium tracking-tight-er text-ink">Add a contact</h2>
              <p className="mt-1 text-sm text-paper-600">
                For walk-ins, paper sign-ups, or quick manual entry. Tags are lowercased and
                de-duplicated.
              </p>
            </div>
            <button type="button" className="btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="h-eyebrow">Email</span>
              <input
                className="input mt-1"
                required
                type="email"
                value={newContact.email}
                onChange={(e) => setNewContact((c) => ({ ...c, email: e.target.value }))}
                placeholder="email@example.com"
              />
            </label>
            <label className="block">
              <span className="h-eyebrow">First name</span>
              <input
                className="input mt-1"
                value={newContact.firstName}
                onChange={(e) => setNewContact((c) => ({ ...c, firstName: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="h-eyebrow">Last name</span>
              <input
                className="input mt-1"
                value={newContact.lastName}
                onChange={(e) => setNewContact((c) => ({ ...c, lastName: e.target.value }))}
              />
            </label>
            <label className="block md:col-span-2">
              <span className="h-eyebrow">Tags</span>
              <input
                className="input mt-1"
                value={newContact.tags}
                onChange={(e) => setNewContact((c) => ({ ...c, tags: e.target.value }))}
                placeholder="donor, volunteer, board"
              />
              <span className="mt-1 block text-xs text-paper-500">Comma-separated.</span>
            </label>
          </div>
          <div className="mt-5 flex justify-end">
            <button className="btn" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : 'Create contact'}
            </button>
          </div>
        </form>
      ) : null}

      <section className="mb-4 panel p-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_220px_auto] sm:items-center">
          <div className="relative">
            <svg
              width={15}
              height={15}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-paper-400"
            >
              <circle cx={11} cy={11} r={7} />
              <path d="m20 20-3-3" />
            </svg>
            <input
              className="input pl-9"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder="Search name, email, or phone"
            />
          </div>
          <input
            className="input"
            value={tag}
            onChange={(e) => { setTag(e.target.value); setPage(1); }}
            placeholder="Filter by tag"
          />
          <button
            type="button"
            className="btn-ghost"
            onClick={() => { setQ(''); setTag(''); setPage(1); }}
            disabled={!filtered}
          >
            Clear filters
          </button>
        </div>
      </section>

      {contacts.isSuccess && rows.length === 0 ? (
        <EmptyState
          title={filtered ? 'No contacts match.' : 'No contacts yet.'}
          description={filtered
            ? 'Broaden the search, drop a tag filter, or add one by hand.'
            : 'Contacts arrive from bookings and kiosk check-ins. Or add one by hand.'}
        />
      ) : (
        <section className="panel overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-paper-200 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-paper-500">
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3">Tags</th>
                <th className="px-5 py-3">Phone</th>
                <th className="px-5 py-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {contacts.isPending
                ? <SkeletonRows cols={4} rows={8} />
                : rows.map((c) => (
                  <tr key={c.id} className="group border-t border-paper-100 transition hover:bg-paper-50/70">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span
                          aria-hidden
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper-100 font-display text-[13px] font-medium tracking-tight-er text-paper-600 ring-1 ring-paper-200"
                        >
                          {initials(c)}
                        </span>
                        <div className="min-w-0">
                          <Link
                            href={`/app/contacts/profile?id=${c.id}`}
                            className="font-medium text-ink transition group-hover:text-brand-accent"
                          >
                            {contactName(c)}
                          </Link>
                          <div className="truncate text-xs text-paper-500">
                            {c.piiRedacted ? (
                              <span className="italic">PII redacted</span>
                            ) : (
                              c.email ?? <span className="text-paper-400">No email</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex max-w-md flex-wrap gap-1.5">
                        {c.tags.length
                          ? c.tags.map((t) => <span key={t} className="badge">{t}</span>)
                          : <span className="text-paper-400">—</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 tabular-nums text-paper-700">
                      {c.phone ?? <span className="text-paper-400">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-paper-600">
                      <Timestamp value={c.updatedAt} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}

      {meta && meta.pages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm text-paper-600">
          <span className="tabular-nums">{meta.total} contacts</span>
          <div className="flex items-center gap-2">
            <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              ← Previous
            </button>
            <span className="tabular-nums">Page {meta.page} of {meta.pages}</span>
            <button className="btn-ghost" disabled={page >= meta.pages} onClick={() => setPage((p) => p + 1)}>
              Next →
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
