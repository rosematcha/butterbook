import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  NOTIFICATION_STATUSES,
  paginationSchema,
  testSendNotificationSchema,
} from '@butterbook/shared';
import { withOrgContext, withOrgRead } from '../db/index.js';
import { NotFoundError } from '../errors/index.js';
import { renderTemplate } from '../services/notifications/render.js';

const orgParam = z.object({ orgId: z.string().uuid() });
const templateParam = z.object({ orgId: z.string().uuid(), templateKey: z.string().min(1).max(100) });

export function registerNotificationRoutes(app: FastifyInstance): void {
  app.get('/api/v1/orgs/:orgId/notifications/templates', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    await req.requirePermission(orgId, 'notifications.manage');
    return withOrgRead(orgId, async (tx) => {
      const rows = await tx
        .selectFrom('notification_templates')
        .select(['id', 'template_key', 'subject', 'body_html', 'body_text', 'updated_at'])
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
        .select(['id', 'template_key', 'subject', 'body_html', 'body_text', 'updated_at'])
        .where('org_id', '=', orgId)
        .where('template_key', '=', templateKey)
        .executeTakeFirst();
      if (!row) throw new NotFoundError();
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
      const sampleVars: Record<string, unknown> = {
        orgName: org?.name ?? 'Example Museum',
        orgTimezone: org?.timezone ?? 'UTC',
        visitorName: 'Sample Visitor',
        eventName: 'Sample Event',
        eventUrl: 'https://example.com/event',
        inviterName: 'Sample Inviter',
        acceptUrl: 'https://example.com/accept',
        scheduledAt: new Date().toISOString(),
        scheduledAtLocal: new Intl.DateTimeFormat('en-US', {
          dateStyle: 'full',
          timeStyle: 'short',
          timeZone: org?.timezone ?? 'UTC',
        }).format(new Date()),
      };
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
