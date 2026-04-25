'use client';
import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from '../../../lib/api';
import { useConfirm } from '../../../lib/confirm';
import { usePermissions } from '../../../lib/permissions';
import { useSession } from '../../../lib/session';
import { useToast } from '../../../lib/toast';
import { EmptyState } from '../../components/empty-state';
import { SkeletonRows } from '../../components/skeleton-rows';
import { Timestamp } from '../../components/timestamp';
import type { Segment } from '../contacts/types';

type BroadcastStatus = 'draft' | 'sending' | 'sent' | 'failed';

interface Broadcast {
  id: string;
  orgId: string;
  segmentId: string | null;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  status: BroadcastStatus;
  recipientCount: number | null;
  scheduledFor: string | null;
  sentAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PreviewRecipient {
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface Draft {
  id: string | null;
  segmentId: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

const emptyDraft: Draft = {
  id: null,
  segmentId: '',
  subject: '',
  bodyHtml: '<p>Hi {{visitorName}},</p>\n<p></p>\n<p>—{{orgName}}</p>',
  bodyText: 'Hi {{visitorName}},\n\n\n—{{orgName}}',
};

function apiErrMsg(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.problem.detail ?? e.problem.title : fallback;
}

function statusBadge(status: BroadcastStatus): { label: string; className: string } {
  switch (status) {
    case 'draft':
      return { label: 'Draft', className: 'bg-paper-100 text-paper-600' };
    case 'sending':
      return { label: 'Sending', className: 'bg-amber-100 text-amber-800' };
    case 'sent':
      return { label: 'Sent', className: 'bg-emerald-100 text-emerald-800' };
    case 'failed':
      return { label: 'Failed', className: 'bg-red-100 text-red-800' };
  }
}

export default function BroadcastsPage() {
  const { activeOrgId } = useSession();
  const perms = usePermissions();
  const canSend = perms.has('broadcasts.send');
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editorOpen, setEditorOpen] = useState(false);
  const [testAddress, setTestAddress] = useState('');

  const broadcasts = useQuery({
    queryKey: ['broadcasts', activeOrgId],
    queryFn: () => apiGet<{ data: Broadcast[] }>(`/api/v1/orgs/${activeOrgId}/broadcasts`),
    enabled: !!activeOrgId && canSend,
  });
  const segments = useQuery({
    queryKey: ['segments', activeOrgId],
    queryFn: () => apiGet<{ data: Segment[] }>(`/api/v1/orgs/${activeOrgId}/segments`),
    enabled: !!activeOrgId && canSend,
  });

  const segmentById = useMemo(
    () => new Map((segments.data?.data ?? []).map((s) => [s.id, s])),
    [segments.data],
  );
  const rows = broadcasts.data?.data ?? [];

  const preview = useQuery({
    queryKey: ['broadcast-preview', activeOrgId, draft.id],
    queryFn: () =>
      apiPost<{ data: PreviewRecipient[]; meta: { previewLimit: number; count: number } }>(
        `/api/v1/orgs/${activeOrgId}/broadcasts/${draft.id}/preview`,
      ),
    enabled: !!activeOrgId && !!draft.id && editorOpen,
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        segmentId: draft.segmentId || null,
        subject: draft.subject.trim(),
        bodyHtml: draft.bodyHtml,
        bodyText: draft.bodyText,
      };
      if (draft.id) {
        return apiPatch<{ data: Broadcast }>(`/api/v1/orgs/${activeOrgId}/broadcasts/${draft.id}`, body);
      }
      return apiPost<{ data: Broadcast }>(`/api/v1/orgs/${activeOrgId}/broadcasts`, body);
    },
    onSuccess: (res) => {
      setDraft({
        id: res.data.id,
        segmentId: res.data.segmentId ?? '',
        subject: res.data.subject,
        bodyHtml: res.data.bodyHtml,
        bodyText: res.data.bodyText,
      });
      qc.invalidateQueries({ queryKey: ['broadcasts', activeOrgId] });
      qc.invalidateQueries({ queryKey: ['broadcast-preview', activeOrgId, res.data.id] });
      toast.push({ kind: 'success', message: 'Broadcast saved' });
    },
    onError: (e) => toast.push({ kind: 'error', message: apiErrMsg(e, 'Save failed') }),
  });

  const send = useMutation({
    mutationFn: (id: string) => apiPost<{ data: Broadcast }>(`/api/v1/orgs/${activeOrgId}/broadcasts/${id}/send`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['broadcasts', activeOrgId] });
      toast.push({ kind: 'success', message: `Queued ${res.data.recipientCount ?? 0} recipients` });
      setEditorOpen(false);
      setDraft(emptyDraft);
    },
    onError: (e) => toast.push({ kind: 'error', message: apiErrMsg(e, 'Send failed') }),
  });

  const testSend = useMutation({
    mutationFn: () =>
      apiPost(`/api/v1/orgs/${activeOrgId}/broadcasts/${draft.id}/test-send`, { toAddress: testAddress }),
    onSuccess: () => toast.push({ kind: 'success', message: `Test queued to ${testAddress}` }),
    onError: (e) => toast.push({ kind: 'error', message: apiErrMsg(e, 'Test send failed') }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/v1/orgs/${activeOrgId}/broadcasts/${id}`),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['broadcasts', activeOrgId] });
      toast.push({ kind: 'success', message: 'Broadcast deleted' });
      if (draft.id === id) {
        setDraft(emptyDraft);
        setEditorOpen(false);
      }
    },
    onError: (e) => toast.push({ kind: 'error', message: apiErrMsg(e, 'Delete failed') }),
  });

  function newBroadcast() {
    setDraft(emptyDraft);
    setEditorOpen(true);
  }

  function edit(broadcast: Broadcast) {
    setDraft({
      id: broadcast.id,
      segmentId: broadcast.segmentId ?? '',
      subject: broadcast.subject,
      bodyHtml: broadcast.bodyHtml,
      bodyText: broadcast.bodyText,
    });
    setEditorOpen(true);
  }

  function viewSent(broadcast: Broadcast) {
    setDraft({
      id: broadcast.id,
      segmentId: broadcast.segmentId ?? '',
      subject: broadcast.subject,
      bodyHtml: broadcast.bodyHtml,
      bodyText: broadcast.bodyText,
    });
    setEditorOpen(true);
  }

  async function onDelete(broadcast: Broadcast) {
    const ok = await confirm({
      title: `Delete "${broadcast.subject}"?`,
      description:
        broadcast.status === 'draft'
          ? 'The draft will be removed.'
          : 'The failed broadcast will be removed. Outbox rows already created are not deleted.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) remove.mutate(broadcast.id);
  }

  async function onSend() {
    if (!draft.id) return;
    const segmentName = draft.segmentId
      ? segmentById.get(draft.segmentId)?.name ?? 'this segment'
      : 'all contacts';
    const recipientCount = preview.data?.meta.count ?? null;
    const ok = await confirm({
      title: 'Send broadcast?',
      description: `Queues one email per recipient in ${segmentName}${
        recipientCount !== null ? ` (${recipientCount} contacts)` : ''
      }. This cannot be undone.`,
      confirmLabel: 'Send',
    });
    if (ok) send.mutate(draft.id);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  const editingExisting = !!draft.id;
  const editingDraft = editingExisting && rows.find((r) => r.id === draft.id)?.status === 'draft';

  if (!perms.loading && !canSend) {
    return (
      <EmptyState
        title="Permission required."
        description="Sending broadcasts requires the broadcasts.send permission."
      />
    );
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-eyebrow">Members &amp; CRM</div>
          <h1 className="h-display mt-1">Broadcasts</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-paper-600">
            Send a one-off email to a saved segment. Each recipient gets one outbox row, rendered through Handlebars.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm tabular-nums text-paper-500">{rows.length} broadcasts</span>
          <button type="button" className="btn" onClick={newBroadcast}>New broadcast</button>
        </div>
      </div>

      <div className={`grid gap-6 ${editorOpen ? 'xl:grid-cols-[minmax(0,1fr)_440px]' : ''}`}>
        <section className="panel overflow-hidden">
          {broadcasts.isSuccess && rows.length === 0 ? (
            <EmptyState
              className="m-6"
              title="No broadcasts yet."
              description="Drafts are saved here. Once sent, the recipient count and timestamp appear in this list."
            />
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-paper-200 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-paper-500">
                  <th className="px-5 py-3">Subject</th>
                  <th className="px-5 py-3">Segment</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Recipients</th>
                  <th className="px-5 py-3">Updated</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {broadcasts.isPending ? (
                  <SkeletonRows cols={6} rows={4} />
                ) : (
                  rows.map((broadcast) => {
                    const isSelected = draft.id === broadcast.id;
                    const badge = statusBadge(broadcast.status);
                    const segmentName = broadcast.segmentId
                      ? segmentById.get(broadcast.segmentId)?.name ?? 'Deleted segment'
                      : 'All contacts';
                    return (
                      <tr
                        key={broadcast.id}
                        className={`group cursor-pointer border-t border-paper-100 transition ${
                          isSelected ? 'bg-brand-accent/5' : 'hover:bg-paper-50/70'
                        }`}
                        onClick={() => (broadcast.status === 'draft' ? edit(broadcast) : viewSent(broadcast))}
                      >
                        <td className="px-5 py-3.5">
                          <div className="font-medium text-ink">{broadcast.subject || <span className="italic text-paper-400">(no subject)</span>}</div>
                        </td>
                        <td className="px-5 py-3.5 text-paper-700">{segmentName}</td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>{badge.label}</span>
                        </td>
                        <td className="px-5 py-3.5 tabular-nums text-paper-700">
                          {broadcast.recipientCount ?? <span className="text-paper-400">—</span>}
                        </td>
                        <td className="px-5 py-3.5 text-paper-600">
                          <Timestamp value={broadcast.sentAt ?? broadcast.updatedAt} />
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {broadcast.status === 'draft' || broadcast.status === 'failed' ? (
                            <button
                              type="button"
                              className="btn-ghost text-xs text-red-700 hover:bg-red-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                void onDelete(broadcast);
                              }}
                            >
                              Delete
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
          )}
        </section>

        {editorOpen ? (
          <aside className="space-y-5">
            <form onSubmit={onSubmit} className="panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="h-eyebrow">{editingExisting ? (editingDraft ? 'Editing' : 'Read-only') : 'New'}</div>
                  <h2 className="mt-1 font-display text-lg font-medium tracking-tight-er text-ink">
                    {draft.subject || (editingExisting ? '(no subject)' : 'New broadcast')}
                  </h2>
                </div>
                <button
                  type="button"
                  className="btn-ghost text-xs"
                  onClick={() => {
                    setEditorOpen(false);
                    setDraft(emptyDraft);
                  }}
                >
                  Close
                </button>
              </div>

              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="h-eyebrow">Segment</span>
                  <select
                    className="input mt-1"
                    value={draft.segmentId}
                    onChange={(e) => setDraft({ ...draft, segmentId: e.target.value })}
                    disabled={!editingDraft && editingExisting}
                  >
                    <option value="">All contacts</option>
                    {(segments.data?.data ?? []).map((segment) => (
                      <option key={segment.id} value={segment.id}>
                        {segment.name}
                        {segment.visitorCount !== null ? ` · ${segment.visitorCount}` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="h-eyebrow">Subject</span>
                  <input
                    className="input mt-1"
                    required
                    value={draft.subject}
                    onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                    placeholder="Spring members-only opening"
                    disabled={!editingDraft && editingExisting}
                  />
                </label>

                <label className="block">
                  <span className="h-eyebrow">HTML body</span>
                  <textarea
                    className="input mt-1 font-mono text-xs"
                    rows={8}
                    required
                    value={draft.bodyHtml}
                    onChange={(e) => setDraft({ ...draft, bodyHtml: e.target.value })}
                    disabled={!editingDraft && editingExisting}
                  />
                </label>

                <label className="block">
                  <span className="h-eyebrow">Plain text body</span>
                  <textarea
                    className="input mt-1 font-mono text-xs"
                    rows={6}
                    required
                    value={draft.bodyText}
                    onChange={(e) => setDraft({ ...draft, bodyText: e.target.value })}
                    disabled={!editingDraft && editingExisting}
                  />
                </label>

                <p className="text-xs text-paper-500">
                  Variables: <code>{'{{visitorName}}'}</code>, <code>{'{{firstName}}'}</code>,{' '}
                  <code>{'{{lastName}}'}</code>, <code>{'{{email}}'}</code>, <code>{'{{orgName}}'}</code>.
                </p>

                {editingDraft || !editingExisting ? (
                  <button className="btn w-full" disabled={save.isPending}>
                    {save.isPending ? 'Saving…' : editingExisting ? 'Save changes' : 'Save draft'}
                  </button>
                ) : null}
              </div>
            </form>

            {editingExisting ? (
              <section className="panel p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-base font-medium tracking-tight-er text-ink">Recipients</h2>
                  {preview.data ? (
                    <span className="font-display text-2xl font-medium tracking-tight-er tabular-nums text-ink">
                      {preview.data.meta.count}
                    </span>
                  ) : null}
                </div>
                {preview.isPending ? (
                  <p className="mt-3 text-sm text-paper-500">Loading…</p>
                ) : preview.data?.meta.count === 0 ? (
                  <p className="mt-3 text-sm italic text-paper-500">No recipients match yet.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-paper-100">
                    {(preview.data?.data ?? []).slice(0, 25).map((r) => (
                      <li key={r.email} className="py-2 text-sm">
                        <div className="font-medium text-ink">
                          {[r.firstName, r.lastName].filter(Boolean).join(' ') || r.email}
                        </div>
                        <div className="text-xs text-paper-500">{r.email}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}

            {editingDraft ? (
              <section className="panel p-5">
                <h2 className="font-display text-base font-medium tracking-tight-er text-ink">Test send</h2>
                <p className="mt-2 text-sm text-paper-600">
                  Queue one outbox row to a single address with sample variables. Demo orgs will be suppressed.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    className="input flex-1"
                    type="email"
                    placeholder="you@example.com"
                    value={testAddress}
                    onChange={(e) => setTestAddress(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => testSend.mutate()}
                    disabled={!testAddress || testSend.isPending}
                  >
                    {testSend.isPending ? 'Sending…' : 'Send test'}
                  </button>
                </div>
              </section>
            ) : null}

            {editingDraft ? (
              <section className="panel p-5">
                <h2 className="font-display text-base font-medium tracking-tight-er text-ink">Send broadcast</h2>
                <p className="mt-2 text-sm text-paper-600">
                  Queues one outbox row per recipient. Save changes first if you have edits.
                </p>
                <button
                  type="button"
                  className="btn-accent mt-3 w-full"
                  onClick={() => void onSend()}
                  disabled={send.isPending || preview.data?.meta.count === 0}
                >
                  {send.isPending ? 'Sending…' : `Send to ${preview.data?.meta.count ?? '…'} recipients`}
                </button>
              </section>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
