'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '../../../lib/api';
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
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testAddress, setTestAddress] = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const limit = 25;

  const templates = useQuery({
    queryKey: ['notif-templates', activeOrgId],
    queryFn: () =>
      apiGet<{ data: TemplateRow[] }>(
        `/api/v1/orgs/${activeOrgId}/notifications/templates`,
      ),
    enabled: !!activeOrgId,
  });

  const outbox = useQuery({
    queryKey: ['notif-outbox', activeOrgId, statusFilter, page],
    queryFn: () =>
      apiGet<{ data: OutboxRow[]; meta: { total: number; pages: number } }>(
        `/api/v1/orgs/${activeOrgId}/notifications/outbox?page=${page}&limit=${limit}${
          statusFilter ? `&status=${statusFilter}` : ''
        }`,
      ),
    enabled: !!activeOrgId,
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

  if (templates.isError || outbox.isError) {
    return (
      <EmptyState
        title="Permission required."
        description="Managing notifications requires the notifications.manage permission. Ask a superadmin to grant it."
      />
    );
  }

  const templateRows = templates.data?.data ?? [];
  const outboxRows = outbox.data?.data ?? [];

  return (
    <div className="space-y-8">
      <div>
        <div className="h-eyebrow">Delivery</div>
        <h1 className="h-display mt-1">Notifications</h1>
        <p className="mt-2 max-w-2xl text-sm text-paper-600">
          Templates render Handlebars variables (like <code className="rounded bg-paper-100 px-1 py-0.5 text-xs">{'{{visitorName}}'}</code>).
          Seeded defaults are read-only in this release — use <em>Send test</em> to verify delivery.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-medium tracking-tight-er text-ink">Templates</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {templates.isPending
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="panel p-4">
                  <SkeletonRows cols={1} rows={3} />
                </div>
              ))
            : null}
          {templateRows.map((t) => {
            const expanded = expandedKey === t.template_key;
            return (
              <div key={t.id} className="panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <code className="rounded bg-paper-100 px-1.5 py-0.5 text-xs text-ink">
                      {t.template_key}
                    </code>
                    <div className="mt-2 truncate font-medium text-ink">{t.subject}</div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedKey(expanded ? null : t.template_key)}
                      className="btn-ghost text-xs"
                    >
                      {expanded ? 'Hide' : 'Preview'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTestingKey(t.template_key);
                        setTestAddress('');
                      }}
                      className="btn-secondary text-xs"
                    >
                      Send test
                    </button>
                  </div>
                </div>
                {expanded ? (
                  <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded border border-paper-200 bg-paper-50 p-3 text-xs text-paper-700">
                    {t.body_text}
                  </pre>
                ) : null}
              </div>
            );
          })}
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
