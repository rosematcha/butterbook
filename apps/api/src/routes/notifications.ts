import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  NOTIFICATION_STATUSES,
  paginationSchema,
  testSendNotificationSchema,
  updateNotificationTemplateSchema,
} from '@butterbook/shared';
import { withOrgContext, withOrgRead } from '../db/index.js';
import { NotFoundError, ValidationError } from '../errors/index.js';
import { DEFAULT_TEMPLATES } from '../services/notifications/default-templates.js';
import { renderTemplate, validateTemplateSource } from '../services/notifications/render.js';

const orgParam = z.object({ orgId: z.string().uuid() });
const templateParam = z.object({ orgId: z.string().uuid(), templateKey: z.string().min(1).max(100) });

function defaultTemplate(templateKey: string) {
  return DEFAULT_TEMPLATES.find((t) => t.templateKey === templateKey);
}

function sampleTemplateVars(org?: { name: string; timezone: string } | null): Record<string, unknown> {
  const now = new Date();
  const timezone = org?.timezone ?? 'UTC';
  return {
    orgName: org?.name ?? 'Example Museum',
    orgTimezone: timezone,
    visitorName: 'Sample Visitor',
    visitId: '00000000-0000-0000-0000-000000000001',
    locationId: '00000000-0000-0000-0000-000000000002',
    waitlistEntryId: '00000000-0000-0000-0000-000000000003',
    invitationId: '00000000-0000-0000-0000-000000000004',
    inviterUserId: '00000000-0000-0000-0000-000000000005',
    eventId: '00000000-0000-0000-0000-000000000006',
    eventName: 'Sample Event',
    title: 'Sample Event',
    publicId: 'evt_sample',
    slug: 'sample-event',
    eventUrl: 'https://example.com/event',
    inviterName: 'Sample Inviter',
    inviteeEmail: 'visitor@example.com',
    acceptUrl: 'https://example.com/accept',
    manageUrl: 'https://example.com/manage',
    scheduledAt: now.toISOString(),
    previousScheduledAt: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
    startsAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    bookingMethod: 'self',
    formResponse: {
      name: 'Sample Visitor',
      email: 'visitor@example.com',
      zip: '10001',
      party_size: 2,
    },
    scheduledAtLocal: new Intl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(now),
  };
}

function validateEditableTemplate(src: { subject: string; bodyHtml: string; bodyText: string }): void {
  try {
    validateTemplateSource(src, sampleTemplateVars());
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Template could not be rendered.';
    throw new ValidationError(`Invalid Handlebars template: ${message}`);
  }
}

export function registerNotificationRoutes(app: FastifyInstance): void {
  app.get('/api/v1/orgs/:orgId/notifications/templates', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    await req.requirePermission(orgId, 'notifications.manage');
    return withOrgRead(orgId, async (tx) => {
      const rows = await tx
        .selectFrom('notification_templates')
        .select(['id', 'template_key', 'subject', 'body_html', 'body_text', 'is_customized', 'updated_at'])
        .where('org_id', '=', orgId)
        .orderBy('template_key', 'asc')
        .execute();
      return { data: rows };
    });
  });

  app.get('/api/v1/orgs/:orgId/notifications/templates/:templateKey', async (req) => {
    const { orgId, templateKey } = templateParam.parse(req.params);
    await req.requirePermission(orgId, 'notifications.manage');
    return withOrgRead(orgId, async (tx) => {
      const row = await tx
        .selectFrom('notification_templates')
        .select(['id', 'template_key', 'subject', 'body_html', 'body_text', 'is_customized', 'updated_at'])
        .where('org_id', '=', orgId)
        .where('template_key', '=', templateKey)
        .executeTakeFirst();
      if (!row) throw new NotFoundError();
      return { data: row };
    });
  });

  app.put('/api/v1/orgs/:orgId/notifications/templates/:templateKey', async (req) => {
    const { orgId, templateKey } = templateParam.parse(req.params);
    const body = updateNotificationTemplateSchema.parse(req.body);
    validateEditableTemplate({
      subject: body.subject,
      bodyHtml: body.bodyHtml,
      bodyText: body.bodyText,
    });
    await req.requirePermission(orgId, 'notifications.manage');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const existing = await tx
        .selectFrom('notification_templates')
        .select(['id', 'subject', 'body_html', 'body_text'])
        .where('org_id', '=', orgId)
        .where('template_key', '=', templateKey)
        .executeTakeFirst();
      if (!existing) throw new NotFoundError();
      const row = await tx
        .updateTable('notification_templates')
        .set({
          subject: body.subject,
          body_html: body.bodyHtml,
          body_text: body.bodyText,
          is_customized: true,
          updated_at: new Date(),
        })
        .where('org_id', '=', orgId)
        .where('template_key', '=', templateKey)
        .returning(['id', 'template_key', 'subject', 'body_html', 'body_text', 'is_customized', 'updated_at'])
        .executeTakeFirstOrThrow();
      await audit({
        action: 'notification_template.updated',
        targetType: 'notification_template',
        targetId: row.id,
        diff: {
          before: {
            subject: existing.subject,
            bodyHtml: existing.body_html,
            bodyText: existing.body_text,
          },
          after: body,
        },
      });
      return { data: row };
    });
  });

  app.post('/api/v1/orgs/:orgId/notifications/templates/:templateKey/revert', async (req) => {
    const { orgId, templateKey } = templateParam.parse(req.params);
    const def = defaultTemplate(templateKey);
    if (!def) throw new NotFoundError();
    await req.requirePermission(orgId, 'notifications.manage');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const existing = await tx
        .selectFrom('notification_templates')
        .select(['id', 'subject', 'body_html', 'body_text', 'is_customized'])
        .where('org_id', '=', orgId)
        .where('template_key', '=', templateKey)
        .executeTakeFirst();
      if (!existing) throw new NotFoundError();
      const row = await tx
        .updateTable('notification_templates')
        .set({
          subject: def.subject,
          body_html: def.bodyHtml,
          body_text: def.bodyText,
          is_customized: false,
          updated_at: new Date(),
        })
        .where('org_id', '=', orgId)
        .where('template_key', '=', templateKey)
        .returning(['id', 'template_key', 'subject', 'body_html', 'body_text', 'is_customized', 'updated_at'])
        .executeTakeFirstOrThrow();
      await audit({
        action: 'notification_template.reverted',
        targetType: 'notification_template',
        targetId: row.id,
        diff: {
          before: {
            subject: existing.subject,
            bodyHtml: existing.body_html,
            bodyText: existing.body_text,
            isCustomized: existing.is_customized,
          },
          after: {
            subject: def.subject,
            bodyHtml: def.bodyHtml,
            bodyText: def.bodyText,
            isCustomized: false,
          },
        },
      });
      return { data: row };
    });
  });

  app.get('/api/v1/orgs/:orgId/notifications/outbox', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const q = paginationSchema
      .extend({
        status: z.enum(NOTIFICATION_STATUSES).optional(),
      })
      .parse(req.query);
    await req.requirePermission(orgId, 'notifications.manage');
    return withOrgRead(orgId, async (tx) => {
      let query = tx
        .selectFrom('notifications_outbox')
        .select([
          'id',
          'to_address',
          'template_key',
          'rendered_subject',
          'status',
          'attempts',
          'scheduled_at',
          'sent_at',
          'last_error',
          'provider_message_id',
          'created_at',
        ])
        .where('org_id', '=', orgId);
      if (q.status) query = query.where('status', '=', q.status);
      let totalQ = tx
        .selectFrom('notifications_outbox')
        .select((eb) => eb.fn.countAll<number>().as('c'))
        .where('org_id', '=', orgId);
      if (q.status) totalQ = totalQ.where('status', '=', q.status);
      const totalRow = await totalQ.executeTakeFirst();
      const rows = await query
        .orderBy('created_at', 'desc')
        .limit(q.limit)
        .offset((q.page - 1) * q.limit)
        .execute();
      const total = Number(totalRow?.c ?? 0);
      return {
        data: rows,
        meta: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) },
      };
    });
  });

  app.post('/api/v1/orgs/:orgId/notifications/templates/:templateKey/test-send', async (req) => {
    const { orgId, templateKey } = templateParam.parse(req.params);
    const body = testSendNotificationSchema.parse(req.body);
    await req.requirePermission(orgId, 'notifications.manage');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const tpl = await tx
        .selectFrom('notification_templates')
        .select(['subject', 'body_html', 'body_text'])
        .where('org_id', '=', orgId)
        .where('template_key', '=', templateKey)
        .executeTakeFirst();
      if (!tpl) throw new NotFoundError();
      const org = await tx
        .selectFrom('orgs')
        .select(['name', 'timezone'])
        .where('id', '=', orgId)
        .executeTakeFirst();
      const sampleVars = sampleTemplateVars(org);
      const rendered = renderTemplate(
        { subject: tpl.subject, bodyHtml: tpl.body_html, bodyText: tpl.body_text },
        sampleVars,
      );
      const row = await tx
        .insertInto('notifications_outbox')
        .values({
          org_id: orgId,
          to_address: body.toAddress,
          template_key: templateKey,
          rendered_subject: rendered.subject,
          rendered_html: rendered.html,
          rendered_text: rendered.text,
          payload: JSON.stringify({ ...sampleVars, __test: true }),
          status: 'pending',
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();
      await audit({
        action: 'notification.test_sent',
        targetType: 'notification',
        targetId: row.id,
        diff: { after: { templateKey, toAddress: body.toAddress } },
      });
      return { data: { notificationId: row.id } };
    });
  });
}
