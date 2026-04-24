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
  pending: 'bg-paper-200 text-paper-700',
  sending: 'bg-brand-accent/10 text-brand-accent',
  sent: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-amber-100 text-amber-800',
  suppressed: 'bg-paper-100 text-paper-500',
  dead: 'bg-rose-100 text-rose-800',
};

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

  if ((!perms.loading && !canManage) || templates.isError || outbox.isError) {
    return (
      <EmptyState
        title="Permission required."
        description="Managing notifications requires the notifications.manage permission. Ask a superadmin to grant it."
      />
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="h-eyebrow">Delivery</div>
        <h1 className="h-display mt-1">Notifications</h1>
        <p className="mt-2 max-w-2xl text-sm text-paper-600">
          Templates render Handlebars variables (like <code className="rounded bg-paper-100 px-1 py-0.5 text-xs">{'{{visitorName}}'}</code>).
          Saves are validated with strict rendering before delivery can use them.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-medium tracking-tight-er text-ink">Templates</h2>
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-2">
            {templates.isPending ? (
              <div className="panel p-4">
                <SkeletonRows cols={1} rows={6} />
              </div>
            ) : null}
            {templateRows.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedKey(t.template_key)}
                className={`w-full rounded-2xl border p-3 text-left transition ${
                  selectedTemplate?.id === t.id
                    ? 'border-brand-accent bg-brand-accent/5'
                    : 'border-paper-200 bg-white hover:border-paper-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <code className="truncate rounded bg-paper-100 px-1.5 py-0.5 text-xs text-ink">
                    {t.template_key}
                  </code>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                      t.is_customized
                        ? 'bg-brand-accent/10 text-brand-accent'
                        : 'bg-paper-100 text-paper-500'
                    }`}
                  >
                    {t.is_customized ? 'Custom' : 'Default'}
                  </span>
                </div>
                <div className="mt-2 truncate text-sm font-medium text-ink">{t.subject}</div>
              </button>
            ))}
          </div>

          <div className="panel p-5">
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
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="h-eyebrow">Template editor</div>
                    <h3 className="mt-1 font-display text-xl font-medium tracking-tight-er text-ink">
                      {selectedTemplate.template_key}
                    </h3>
                    <p className="mt-1 text-xs text-paper-500">
                      Last updated <Timestamp value={selectedTemplate.updated_at} />
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTestingKey(selectedTemplate.template_key);
                        setTestAddress('');
                      }}
                      className="btn-secondary text-xs"
                    >
                      Send test
                    </button>
                    <button
                      type="button"
                      disabled={!selectedTemplate.is_customized || revertTemplate.isPending}
                      onClick={() => revertTemplate.mutate(selectedTemplate.template_key)}
                      className="btn-ghost text-xs disabled:opacity-50"
                    >
                      {revertTemplate.isPending ? 'Reverting…' : 'Revert'}
                    </button>
                    <button
                      type="submit"
                      disabled={!dirty || updateTemplate.isPending}
                      className="btn-accent text-xs disabled:opacity-50"
                    >
                      {updateTemplate.isPending ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>

                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-paper-500">
                    Subject
                  </span>
                  <input
                    value={form.subject}
                    onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                    className="input mt-1 w-full"
                    maxLength={200}
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-paper-500">
                    HTML body
                  </span>
                  <textarea
                    value={form.bodyHtml}
                    onChange={(e) => setForm((f) => ({ ...f, bodyHtml: e.target.value }))}
                    className="input mt-1 min-h-48 w-full font-mono text-xs"
                    spellCheck={false}
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-paper-500">
                    Text body
                  </span>
                  <textarea
                    value={form.bodyText}
                    onChange={(e) => setForm((f) => ({ ...f, bodyText: e.target.value }))}
                    className="input mt-1 min-h-40 w-full font-mono text-xs"
                    spellCheck={false}
                  />
                </label>

                {updateTemplate.isError || revertTemplate.isError ? (
                  <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    {((updateTemplate.error ?? revertTemplate.error) as Error).message}
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-paper-500">
                      Text preview
                    </div>
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border border-paper-200 bg-paper-50 p-3 text-xs text-paper-700">
                      {form.bodyText}
                    </pre>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-paper-500">
                      HTML template
                    </div>
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border border-paper-200 bg-paper-50 p-3 text-xs text-paper-700">
                      {form.bodyHtml}
                    </pre>
                  </div>
                </div>
              </form>
            ) : (
              <EmptyState title="No templates." description="No notification templates are seeded for this org." />
            )}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-lg font-medium tracking-tight-er text-ink">Outbox</h2>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="input max-w-xs"
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
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2">To</th>
                <th className="px-4 py-2">Template</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Attempts</th>
              </tr>
            </thead>
            <tbody>
              {outbox.isPending ? <SkeletonRows cols={5} rows={6} /> : null}
              {outbox.isSuccess && outboxRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-paper-500">
                    No notifications on this page.
                  </td>
                </tr>
              ) : null}
              {outboxRows.map((r) => (
                <tr key={r.id} className="border-t border-paper-100 align-top">
                  <td className="px-4 py-3 tabular-nums text-paper-700">
                    <Timestamp value={r.created_at} />
                  </td>
                  <td className="px-4 py-3 text-paper-700">{r.to_address}</td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-paper-100 px-1.5 py-0.5 text-xs text-ink">
                      {r.template_key}
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        STATUS_TINT[r.status] ?? 'bg-paper-100 text-paper-700'
                      }`}
                    >
                      {r.status}
                    </span>
                    {r.last_error ? (
                      <div className="mt-1 text-xs text-rose-700">{r.last_error}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-paper-600">{r.attempts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-3">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="btn-secondary disabled:opacity-50"
          >
            Prev
          </button>
          <span className="text-sm text-paper-600">
            Page {page} of {outbox.data?.meta.pages ?? 1}
            {outbox.data ? (
              <span className="ml-2 text-paper-400">
                · {outbox.data.meta.total.toLocaleString()} rows
              </span>
            ) : null}
          </span>
          <button
            disabled={page >= (outbox.data?.meta.pages ?? 1)}
            onClick={() => setPage((p) => p + 1)}
            className="btn-secondary disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </section>

      {testingKey ? (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => setTestingKey(null)}
        >
          <div
            className="panel w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-eyebrow">Send test</div>
            <h3 className="mt-1 font-display text-lg font-medium tracking-tight-er text-ink">
              {testingKey}
            </h3>
            <p className="mt-2 text-sm text-paper-600">
              Renders the template with sample values and enqueues one send.
            </p>
            <input
              type="email"
              value={testAddress}
              onChange={(e) => setTestAddress(e.target.value)}
              placeholder="you@example.com"
              className="input mt-3 w-full"
              autoFocus
            />
            {testSend.isError ? (
              <div className="mt-2 text-sm text-rose-700">
                {(testSend.error as Error).message}
              </div>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
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
                className="btn-accent disabled:opacity-50"
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
