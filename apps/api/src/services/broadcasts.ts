import type { Tx } from '../db/index.js';
import { segmentPredicate } from './segments.js';
import { renderTemplate } from './notifications/render.js';

export interface BroadcastRecipient {
  visitorId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export async function resolveBroadcastRecipients(
  tx: Tx,
  orgId: string,
  segmentId: string | null,
): Promise<BroadcastRecipient[]> {
  let filter: unknown = {};
  if (segmentId) {
    const segment = await tx
      .selectFrom('visitor_segments')
      .select(['filter'])
      .where('org_id', '=', orgId)
      .where('id', '=', segmentId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!segment) return [];
    filter = typeof segment.filter === 'string' ? JSON.parse(segment.filter) : segment.filter;
  }
  const rows = await tx
    .selectFrom('visitors')
    .select(['id', 'email', 'first_name', 'last_name'])
    .where('org_id', '=', orgId)
    .where('deleted_at', 'is', null)
    .where('pii_redacted', '=', false)
    .where(segmentPredicate(filter))
    .execute();
  return rows.map((r) => ({
    visitorId: r.id,
    email: r.email,
    firstName: r.first_name,
    lastName: r.last_name,
  }));
}

export interface BroadcastRow {
  id: string;
  org_id: string;
  segment_id: string | null;
  subject: string;
  body_html: string;
  body_text: string;
  status: 'draft' | 'sending' | 'sent' | 'failed';
  recipient_count: number | null;
  scheduled_for: Date | null;
  sent_at: Date | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export function publicBroadcast(row: BroadcastRow) {
  return {
    id: row.id,
    orgId: row.org_id,
    segmentId: row.segment_id,
    subject: row.subject,
    bodyHtml: row.body_html,
    bodyText: row.body_text,
    status: row.status,
    recipientCount: row.recipient_count,
    scheduledFor: row.scheduled_for?.toISOString() ?? null,
    sentAt: row.sent_at?.toISOString() ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

interface RenderInputs {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

export function renderBroadcastFor(
  src: RenderInputs,
  recipient: { email: string; firstName: string | null; lastName: string | null },
  org: { name: string; timezone: string },
) {
  const visitorName =
    [recipient.firstName, recipient.lastName].filter((s) => s && s.length > 0).join(' ').trim() ||
    'there';
  const vars: Record<string, unknown> = {
    visitorName,
    firstName: recipient.firstName ?? '',
    lastName: recipient.lastName ?? '',
    email: recipient.email,
    orgName: org.name,
    orgTimezone: org.timezone,
    subject: src.subject,
    bodyHtml: src.bodyHtml,
    bodyText: src.bodyText,
  };
  return renderTemplate({ subject: src.subject, bodyHtml: src.bodyHtml, bodyText: src.bodyText }, vars);
}
