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

export default function ContactsPage() {
  const { activeOrgId } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(1);
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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-eyebrow">Members & CRM</div>
          <h1 className="h-display mt-1">Contacts</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-paper-600">
            Unified visitor records collected from bookings, kiosk check-ins, waitlists, and manual entry.
          </p>
        </div>
        <Link href="/app/contacts/segments" className="btn-secondary">
          Segments
        </Link>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="panel p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
            <input
              className="input"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder="Search name, email, or phone"
            />
            <input
              className="input"
              value={tag}
              onChange={(e) => { setTag(e.target.value); setPage(1); }}
              placeholder="Filter by tag"
            />
            <button className="btn-secondary" onClick={() => { setQ(''); setTag(''); setPage(1); }}>
              Clear
            </button>
          </div>
        </div>

        <form onSubmit={onCreate} className="panel p-4">
          <h2 className="font-display text-base font-medium text-ink">Add contact</h2>
          <div className="mt-3 space-y-2">
            <input className="input" required type="email" value={newContact.email} onChange={(e) => setNewContact((c) => ({ ...c, email: e.target.value }))} placeholder="email@example.com" />
            <div className="grid grid-cols-2 gap-2">
              <input className="input" value={newContact.firstName} onChange={(e) => setNewContact((c) => ({ ...c, firstName: e.target.value }))} placeholder="First name" />
              <input className="input" value={newContact.lastName} onChange={(e) => setNewContact((c) => ({ ...c, lastName: e.target.value }))} placeholder="Last name" />
            </div>
            <input className="input" value={newContact.tags} onChange={(e) => setNewContact((c) => ({ ...c, tags: e.target.value }))} placeholder="Tags, comma separated" />
            <button className="btn w-full" disabled={create.isPending}>{create.isPending ? 'Saving...' : 'Create contact'}</button>
          </div>
        </form>
      </section>

      {contacts.isSuccess && rows.length === 0 ? (
        <EmptyState title="No contacts match this view." description="Try a different search, or add a contact manually." />
      ) : (
        <section className="panel overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-paper-200 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-paper-500">
                <th className="px-4 py-2">Contact</th>
                <th className="px-4 py-2">Tags</th>
                <th className="px-4 py-2">Phone</th>
                <th className="px-4 py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {contacts.isPending ? <SkeletonRows cols={4} rows={6} /> : rows.map((c) => (
                <tr key={c.id} className="border-t border-paper-100 transition hover:bg-paper-50/70">
                  <td className="px-4 py-3">
                    <Link href={`/app/contacts/profile?id=${c.id}`} className="font-medium text-ink hover:text-brand-accent">
                      {contactName(c)}
                    </Link>
                    <div className="text-xs text-paper-500">{c.piiRedacted ? 'PII redacted' : c.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex max-w-md flex-wrap gap-1.5">
                      {c.tags.length ? c.tags.map((t) => <span key={t} className="badge">{t}</span>) : <span className="text-paper-400">-</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-paper-700">{c.phone ?? '-'}</td>
                  <td className="px-4 py-3 text-paper-600"><Timestamp value={c.updatedAt} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {meta && meta.pages > 1 ? (
        <div className="flex items-center justify-between text-sm text-paper-600">
          <span>{meta.total} contacts</span>
          <div className="flex items-center gap-2">
            <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
            <span>Page {meta.page} of {meta.pages}</span>
            <button className="btn-secondary" disabled={page >= meta.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
