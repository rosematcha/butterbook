'use client';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPut } from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { useSession } from '../../../lib/session';
import { Timestamp } from '../../components/timestamp';
import { EmptyState } from '../../components/empty-state';
import { SkeletonRows } from '../../components/skeleton-rows';

interface TemplateRow {
  id: string;
  template_key: string;
  subject: string;
  body_html: string;
  body_text: string;
  is_customized: boolean;
  updated_at: string;
}

interface OutboxRow {
  id: string;
  to_address: string;
  template_key: string;
  rendered_subject: string;
  status: string;
  attempts: number;
  scheduled_at: string;
  sent_at: string | null;
  last_error: string | null;
  provider_message_id: string | null;
  created_at: string;
}

const STATUS_TINT: Record<string, string> = {
  pending: 'bg-paper-100 text-paper-700',
  sending: 'bg-brand-accent/10 text-brand-accent',
  sent: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-amber-50 text-amber-800',
  suppressed: 'bg-paper-100 text-paper-500',
  dead: 'bg-rose-50 text-rose-700',
};

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-paper-400',
  sending: 'bg-brand-accent',
  sent: 'bg-emerald-500',
  failed: 'bg-amber-500',
  suppressed: 'bg-paper-300',
  dead: 'bg-rose-500',
};

function templateGroup(key: string): string {
  const dot = key.indexOf('.');
  if (dot === -1) return 'Other';
  const head = key.slice(0, dot);
  return head.charAt(0).toUpperCase() + head.slice(1);
}

function templateLabel(key: string): string {
  const dot = key.indexOf('.');
  if (dot === -1) return key;
  return key.slice(dot + 1).replace(/_/g, ' ');
}

export default function NotificationsPage() {
  const { activeOrgId } = useSession();
  const perms = usePermissions();
  const canManage = perms.has('notifications.manage');
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testAddress, setTestAddress] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [form, setForm] = useState({ subject: '', bodyHtml: '', bodyText: '' });
  const [previewMode, setPreviewMode] = useState<'text' | 'html'>('text');
  const limit = 25;

  const templates = useQuery({
    queryKey: ['notif-templates', activeOrgId],
    queryFn: () =>
      apiGet<{ data: TemplateRow[] }>(
        `/api/v1/orgs/${activeOrgId}/notifications/templates`,
      ),
    enabled: !!activeOrgId && canManage,
  });

  const outbox = useQuery({
    queryKey: ['notif-outbox', activeOrgId, statusFilter, page],
    queryFn: () =>
      apiGet<{ data: OutboxRow[]; meta: { total: number; pages: number } }>(
        `/api/v1/orgs/${activeOrgId}/notifications/outbox?page=${page}&limit=${limit}${
          statusFilter ? `&status=${statusFilter}` : ''
        }`,
      ),
    enabled: !!activeOrgId && canManage,
  });

  const testSend = useMutation({
    mutationFn: async ({ templateKey, toAddress }: { templateKey: string; toAddress: string }) =>
      apiPost<{ data: { notificationId: string } }>(
        `/api/v1/orgs/${activeOrgId}/notifications/templates/${templateKey}/test-send`,
        { toAddress },
      ),
    onSuccess: () => {
      setTestingKey(null);
      setTestAddress('');
      qc.invalidateQueries({ queryKey: ['notif-outbox', activeOrgId] });
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async ({
      templateKey,
      values,
    }: {
      templateKey: string;
      values: { subject: string; bodyHtml: string; bodyText: string };
    }) =>
      apiPut<{ data: TemplateRow }>(
        `/api/v1/orgs/${activeOrgId}/notifications/templates/${encodeURIComponent(templateKey)}`,
        values,
      ),
    onSuccess: (res) => {
      qc.setQueryData<{ data: TemplateRow[] }>(['notif-templates', activeOrgId], (current) => ({
        data: (current?.data ?? []).map((t) => (t.id === res.data.id ? res.data : t)),
      }));
      setForm({
        subject: res.data.subject,
        bodyHtml: res.data.body_html,
        bodyText: res.data.body_text,
      });
    },
  });

  const revertTemplate = useMutation({
    mutationFn: async (templateKey: string) =>
      apiPost<{ data: TemplateRow }>(
        `/api/v1/orgs/${activeOrgId}/notifications/templates/${encodeURIComponent(templateKey)}/revert`,
      ),
    onSuccess: (res) => {
      qc.setQueryData<{ data: TemplateRow[] }>(['notif-templates', activeOrgId], (current) => ({
        data: (current?.data ?? []).map((t) => (t.id === res.data.id ? res.data : t)),
      }));
      setForm({
        subject: res.data.subject,
        bodyHtml: res.data.body_html,
        bodyText: res.data.body_text,
      });
    },
  });

  const templateRows = templates.data?.data ?? [];
  const outboxRows = outbox.data?.data ?? [];
  const selectedTemplate = useMemo(
    () => templateRows.find((t) => t.template_key === selectedKey) ?? templateRows[0] ?? null,
    [selectedKey, templateRows],
  );
  const dirty = selectedTemplate
    ? form.subject !== selectedTemplate.subject ||
      form.bodyHtml !== selectedTemplate.body_html ||
      form.bodyText !== selectedTemplate.body_text
    : false;

  useEffect(() => {
    if (!selectedTemplate) return;
    if (selectedKey !== selectedTemplate.template_key) {
      setSelectedKey(selectedTemplate.template_key);
    }
    setForm({
      subject: selectedTemplate.subject,
      bodyHtml: selectedTemplate.body_html,
      bodyText: selectedTemplate.body_text,
    });
  }, [selectedKey, selectedTemplate?.id, selectedTemplate?.updated_at]);

  const groupedTemplates = useMemo(() => {
    const groups = new Map<string, TemplateRow[]>();
    for (const t of templateRows) {
      const g = templateGroup(t.template_key);
      const arr = groups.get(g);
      if (arr) arr.push(t);
      else groups.set(g, [t]);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [templateRows]);

  const customizedCount = templateRows.filter((t) => t.is_customized).length;

  if ((!perms.loading && !canManage) || templates.isError || outbox.isError) {
    return (
      <EmptyState
        title="Permission required."
        description="Managing notifications requires the notifications.manage permission. Ask a superadmin to grant it."
      />
    );
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-eyebrow">Delivery</div>
          <h1 className="h-display mt-1">Notifications</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-paper-600">
            What gets sent, and to whom. Templates render Handlebars variables (
            <code className="rounded bg-paper-100 px-1.5 py-0.5 font-mono text-[12px] text-ink">
              {'{{visitorName}}'}
            </code>
            ) and validate before delivery.
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm tabular-nums text-paper-500">
          <span>{templateRows.length} templates</span>
          <span aria-hidden>·</span>
          <span>
            <strong className="font-medium text-ink">{customizedCount}</strong> customized
          </span>
        </div>
      </div>

      <section className="mb-10">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-medium tracking-tight-er text-ink">Templates</h2>
            <p className="mt-1 text-sm text-paper-600">
              Edit the subject and body. Revert restores the default.
            </p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="space-y-5">
            {templates.isPending ? (
              <div className="panel p-4">
                <SkeletonRows cols={1} rows={6} />
              </div>
            ) : null}

            {groupedTemplates.map(([group, items]) => (
              <div key={group}>
                <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-paper-500">
                  {group}
                </div>
                <div className="space-y-1.5">
                  {items.map((t) => {
                    const isSelected = selectedTemplate?.id === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedKey(t.template_key)}
                        className={`group relative w-full rounded-lg border px-3 py-2.5 text-left transition ${
                          isSelected
                            ? 'border-brand-accent/40 bg-brand-accent/5'
                            : 'border-paper-200 bg-white hover:border-paper-300 hover:bg-paper-50/50'
                        }`}
                      >
                        {isSelected ? (
                          <span
                            aria-hidden
                            className="absolute -left-px top-2 bottom-2 w-[3px] rounded-r-full bg-brand-accent"
                          />
                        ) : null}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-mono text-[11px] uppercase tracking-[0.06em] text-paper-500">
                              {templateLabel(t.template_key)}
                            </div>
                            <div className="mt-1 truncate text-sm font-medium text-ink">
                              {t.subject}
                            </div>
                          </div>
                          {t.is_customized ? (
                            <span className="shrink-0 rounded-full bg-brand-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-brand-accent">
                              Custom
                            </span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="panel p-6">
            {selectedTemplate ? (
              <form
                className="space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  updateTemplate.mutate({
                    templateKey: selectedTemplate.template_key,
                    values: form,
                  });
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-paper-100 pb-4">
                  <div>
                    <div className="h-eyebrow">{templateGroup(selectedTemplate.template_key)} template</div>
                    <h3 className="mt-1 font-display text-2xl font-medium tracking-tight-er text-ink">
                      {templateLabel(selectedTemplate.template_key)}
                    </h3>
                    <p className="mt-1 font-mono text-[11px] text-paper-500">
                      {selectedTemplate.template_key} · updated <Timestamp value={selectedTemplate.updated_at} />
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTestingKey(selectedTemplate.template_key);
                        setTestAddress('');
                      }}
                      className="btn-ghost text-xs"
                    >
                      Send test
                    </button>
                    <button
                      type="button"
                      disabled={!selectedTemplate.is_customized || revertTemplate.isPending}
                      onClick={() => revertTemplate.mutate(selectedTemplate.template_key)}
                      className="btn-ghost text-xs disabled:opacity-40"
                    >
                      {revertTemplate.isPending ? 'Reverting…' : 'Revert to default'}
                    </button>
                    <button
                      type="submit"
                      disabled={!dirty || updateTemplate.isPending}
                      className="btn text-xs disabled:opacity-40"
                    >
                      {updateTemplate.isPending ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
                    </button>
                  </div>
                </div>

                <label className="block">
                  <span className="h-eyebrow">Subject</span>
                  <input
                    value={form.subject}
                    onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                    className="input mt-1 w-full"
                    maxLength={200}
                  />
                  <span className="mt-1 block text-right text-xs tabular-nums text-paper-500">
                    {form.subject.length} / 200
                  </span>
                </label>

                <div>
                  <div className="flex items-end justify-between gap-3">
                    <span className="h-eyebrow">Body</span>
                    <div className="inline-flex rounded-md border border-paper-200 bg-paper-50 p-0.5 text-[11px] font-medium">
                      <button
                        type="button"
                        onClick={() => setPreviewMode('text')}
                        className={`rounded px-2.5 py-1 transition ${
                          previewMode === 'text' ? 'bg-white text-ink shadow-sm' : 'text-paper-600 hover:text-ink'
                        }`}
                      >
                        Text
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewMode('html')}
                        className={`rounded px-2.5 py-1 transition ${
                          previewMode === 'html' ? 'bg-white text-ink shadow-sm' : 'text-paper-600 hover:text-ink'
                        }`}
                      >
                        HTML
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={previewMode === 'text' ? form.bodyText : form.bodyHtml}
                    onChange={(e) =>
                      setForm((f) =>
                        previewMode === 'text'
                          ? { ...f, bodyText: e.target.value }
                          : { ...f, bodyHtml: e.target.value },
                      )
                    }
                    className="input mt-1 min-h-[260px] w-full font-mono text-[12px] leading-relaxed"
                    spellCheck={false}
                  />
                  <span className="mt-1 block text-xs text-paper-500">
                    {previewMode === 'text'
                      ? 'Plain-text fallback for screen readers and some inboxes.'
                      : 'HTML version. Inline styles only, no external CSS.'}
                  </span>
                </div>

                {updateTemplate.isError || revertTemplate.isError ? (
                  <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    {((updateTemplate.error ?? revertTemplate.error) as Error).message}
                  </div>
                ) : null}
              </form>
            ) : (
              <EmptyState
                title="No templates."
                description="No notification templates are seeded for this org."
              />
            )}
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-medium tracking-tight-er text-ink">Outbox</h2>
            <p className="mt-1 text-sm text-paper-600">
              Every render passes through here. Failed and dead rows need a human.
            </p>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="input max-w-[200px]"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="sending">Sending</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="suppressed">Suppressed</option>
            <option value="dead">Dead</option>
          </select>
        </div>

        <div className="panel overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-paper-200 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-paper-500">
                <th className="px-5 py-3">Created</th>
                <th className="px-5 py-3">Recipient</th>
                <th className="px-5 py-3">Template</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Attempts</th>
              </tr>
            </thead>
            <tbody>
              {outbox.isPending ? <SkeletonRows cols={5} rows={6} /> : null}
              {outbox.isSuccess && outboxRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm italic text-paper-400">
                    {statusFilter ? `Nothing in “${statusFilter}”.` : 'Nothing queued yet.'}
                  </td>
                </tr>
              ) : null}
              {outboxRows.map((r) => (
                <tr key={r.id} className="border-t border-paper-100 align-top transition hover:bg-paper-50/70">
                  <td className="px-5 py-3.5 tabular-nums text-paper-700">
                    <Timestamp value={r.created_at} />
                  </td>
                  <td className="px-5 py-3.5 text-paper-700">{r.to_address}</td>
                  <td className="px-5 py-3.5">
                    <code className="rounded bg-paper-100 px-1.5 py-0.5 font-mono text-[11px] text-ink">
                      {r.template_key}
                    </code>
                    {r.rendered_subject ? (
                      <div className="mt-1 max-w-md truncate text-xs text-paper-500">
                        {r.rendered_subject}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        STATUS_TINT[r.status] ?? 'bg-paper-100 text-paper-700'
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`inline-block h-1.5 w-1.5 rounded-full ${
                          STATUS_DOT[r.status] ?? 'bg-paper-400'
                        }`}
                      />
                      {r.status}
                    </span>
                    {r.last_error ? (
                      <div className="mt-1.5 max-w-md text-xs leading-relaxed text-rose-700">{r.last_error}</div>
                    ) : null}
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums text-paper-600">{r.attempts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-paper-600">
          <span className="tabular-nums">
            {outbox.data ? `${outbox.data.meta.total.toLocaleString()} total` : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="btn-ghost disabled:opacity-40"
            >
              ← Previous
            </button>
            <span className="tabular-nums">
              Page {page} of {outbox.data?.meta.pages ?? 1}
            </span>
            <button
              disabled={page >= (outbox.data?.meta.pages ?? 1)}
              onClick={() => setPage((p) => p + 1)}
              className="btn-ghost disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      </section>

      {testingKey ? (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
          onClick={() => setTestingKey(null)}
        >
          <div
            className="panel w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-eyebrow">Send test</div>
            <h3 className="mt-1 font-display text-xl font-medium tracking-tight-er text-ink">
              {templateLabel(testingKey)}
            </h3>
            <p className="mt-1 font-mono text-[11px] text-paper-500">{testingKey}</p>
            <p className="mt-3 text-sm text-paper-600">
              Renders the template with sample values and queues one send to the address below.
            </p>
            <input
              type="email"
              value={testAddress}
              onChange={(e) => setTestAddress(e.target.value)}
              placeholder="you@example.com"
              className="input mt-4 w-full"
              autoFocus
            />
            {testSend.isError ? (
              <div className="mt-2 text-sm text-rose-700">
                {(testSend.error as Error).message}
              </div>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTestingKey(null)}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!testAddress || testSend.isPending}
                onClick={() =>
                  testSend.mutate({ templateKey: testingKey, toAddress: testAddress })
                }
                className="btn disabled:opacity-50"
              >
                {testSend.isPending ? 'Sending…' : 'Send test'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
