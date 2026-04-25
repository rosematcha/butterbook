import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  broadcastIdParamSchema,
  broadcastTestSendSchema,
  createBroadcastSchema,
  listBroadcastsQuerySchema,
  updateBroadcastSchema,
} from '@butterbook/shared';
import { type Tx, withOrgContext, withOrgRead } from '../db/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../errors/index.js';
import {
  publicBroadcast,
  renderBroadcastFor,
  resolveBroadcastRecipients,
} from '../services/broadcasts.js';
import { validateTemplateSource } from '../services/notifications/render.js';

const orgParam = z.object({ orgId: z.string().uuid() });

function validateBroadcastTemplate(src: { subject: string; bodyHtml: string; bodyText: string }): void {
  // Match the variable surface that renderBroadcastFor will provide at send
  // time. Strict-mode Handlebars throws on any unknown variable, so admins
  // catch typos at draft time instead of partway through a fan-out.
  const sampleVars = {
    visitorName: 'Sample Visitor',
    firstName: 'Sample',
    lastName: 'Visitor',
    email: 'visitor@example.com',
    orgName: 'Sample Org',
    orgTimezone: 'UTC',
    subject: src.subject,
    bodyHtml: src.bodyHtml,
    bodyText: src.bodyText,
  };
  try {
    validateTemplateSource(src, sampleVars);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Template could not be rendered.';
    throw new ValidationError(`Invalid Handlebars template: ${message}`);
  }
}

async function assertSegmentBelongsToOrg(tx: Tx, orgId: string, segmentId: string): Promise<void> {
  const seg = await tx
    .selectFrom('visitor_segments')
    .select(['id'])
    .where('org_id', '=', orgId)
    .where('id', '=', segmentId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (!seg) throw new NotFoundError('Segment not found.');
}

export function registerBroadcastRoutes(app: FastifyInstance): void {
  app.get('/api/v1/orgs/:orgId/broadcasts', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const q = listBroadcastsQuerySchema.parse(req.query);
    await req.requirePermission(orgId, 'broadcasts.send');
    return withOrgRead(orgId, async (tx) => {
      let query = tx.selectFrom('broadcasts').selectAll().where('org_id', '=', orgId);
      if (q.status) query = query.where('status', '=', q.status);
      const rows = await query.orderBy('created_at', 'desc').execute();
      return { data: rows.map(publicBroadcast) };
    });
  });

  app.post('/api/v1/orgs/:orgId/broadcasts', async (req) => {
    const { orgId } = orgParam.parse(req.params);
    const body = createBroadcastSchema.parse(req.body);
    await req.requirePermission(orgId, 'broadcasts.send');
    validateBroadcastTemplate({ subject: body.subject, bodyHtml: body.bodyHtml, bodyText: body.bodyText });
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      if (body.segmentId) await assertSegmentBelongsToOrg(tx, orgId, body.segmentId);
      const row = await tx
        .insertInto('broadcasts')
        .values({
          org_id: orgId,
          segment_id: body.segmentId ?? null,
          subject: body.subject,
          body_html: body.bodyHtml,
          body_text: body.bodyText,
          status: 'draft',
          created_by: req.userId ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await audit({
        action: 'broadcast.created',
        targetType: 'broadcast',
        targetId: row.id,
        diff: { after: { segmentId: body.segmentId ?? null, subject: body.subject } },
      });
      return { data: publicBroadcast(row) };
    });
  });

  app.get('/api/v1/orgs/:orgId/broadcasts/:broadcastId', async (req) => {
    const { orgId, broadcastId } = broadcastIdParamSchema.parse(req.params);
    await req.requirePermission(orgId, 'broadcasts.send');
    return withOrgRead(orgId, async (tx) => {
      const row = await tx
        .selectFrom('broadcasts')
        .selectAll()
        .where('org_id', '=', orgId)
        .where('id', '=', broadcastId)
        .executeTakeFirst();
      if (!row) throw new NotFoundError();
      return { data: publicBroadcast(row) };
    });
  });

  app.patch('/api/v1/orgs/:orgId/broadcasts/:broadcastId', async (req) => {
    const { orgId, broadcastId } = broadcastIdParamSchema.parse(req.params);
    const body = updateBroadcastSchema.parse(req.body);
    await req.requirePermission(orgId, 'broadcasts.send');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const current = await tx
        .selectFrom('broadcasts')
        .selectAll()
        .where('org_id', '=', orgId)
        .where('id', '=', broadcastId)
        .executeTakeFirst();
      if (!current) throw new NotFoundError();
      if (current.status !== 'draft') {
        // Audit the attempt — editing a sent broadcast is a security-relevant
        // action even when refused, and "every mutation writes one audit entry"
        // applies to refused mutations too.
        await audit({
          action: 'broadcast.update_rejected',
          targetType: 'broadcast',
          targetId: broadcastId,
          diff: { after: { status: current.status, attempted: body } },
        });
        throw new ConflictError('Only draft broadcasts can be edited.');
      }
      if (body.segmentId !== undefined && body.segmentId !== null) {
        await assertSegmentBelongsToOrg(tx, orgId, body.segmentId);
      }
      const next = {
        subject: body.subject ?? current.subject,
        bodyHtml: body.bodyHtml ?? current.body_html,
        bodyText: body.bodyText ?? current.body_text,
      };
      validateBroadcastTemplate(next);
      const updates: Record<string, unknown> = {};
      if (body.segmentId !== undefined) updates.segment_id = body.segmentId;
      if (body.subject !== undefined) updates.subject = body.subject;
      if (body.bodyHtml !== undefined) updates.body_html = body.bodyHtml;
      if (body.bodyText !== undefined) updates.body_text = body.bodyText;
      updates.updated_at = new Date();
      const row = await tx
        .updateTable('broadcasts')
        .set(updates)
        .where('org_id', '=', orgId)
        .where('id', '=', broadcastId)
        .returningAll()
        .executeTakeFirstOrThrow();
      await audit({
        action: 'broadcast.updated',
        targetType: 'broadcast',
        targetId: broadcastId,
        diff: { after: body },
      });
      return { data: publicBroadcast(row) };
    });
  });

  app.delete('/api/v1/orgs/:orgId/broadcasts/:broadcastId', async (req) => {
    const { orgId, broadcastId } = broadcastIdParamSchema.parse(req.params);
    await req.requirePermission(orgId, 'broadcasts.send');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const row = await tx
        .selectFrom('broadcasts')
        .select(['status'])
        .where('org_id', '=', orgId)
        .where('id', '=', broadcastId)
        .executeTakeFirst();
      if (!row) throw new NotFoundError();
      if (row.status !== 'draft' && row.status !== 'failed') {
        throw new ConflictError('Only draft or failed broadcasts can be deleted.');
      }
      await tx
        .deleteFrom('broadcasts')
        .where('org_id', '=', orgId)
        .where('id', '=', broadcastId)
        .execute();
      await audit({ action: 'broadcast.deleted', targetType: 'broadcast', targetId: broadcastId });
      return { data: { ok: true } };
    });
  });

  app.post('/api/v1/orgs/:orgId/broadcasts/:broadcastId/preview', async (req) => {
    const { orgId, broadcastId } = broadcastIdParamSchema.parse(req.params);
    await req.requirePermission(orgId, 'broadcasts.send');
    return withOrgRead(orgId, async (tx) => {
      const row = await tx
        .selectFrom('broadcasts')
        .select(['segment_id'])
        .where('org_id', '=', orgId)
        .where('id', '=', broadcastId)
        .executeTakeFirst();
      if (!row) throw new NotFoundError();
      const recipients = await resolveBroadcastRecipients(tx, orgId, row.segment_id);
      return {
        data: recipients.slice(0, 25).map((r) => ({ email: r.email, firstName: r.firstName, lastName: r.lastName })),
        meta: { previewLimit: 25, count: recipients.length },
      };
    });
  });

  app.post('/api/v1/orgs/:orgId/broadcasts/:broadcastId/test-send', async (req) => {
    const { orgId, broadcastId } = broadcastIdParamSchema.parse(req.params);
    const body = broadcastTestSendSchema.parse(req.body);
    await req.requirePermission(orgId, 'broadcasts.send');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const broadcast = await tx
        .selectFrom('broadcasts')
        .selectAll()
        .where('org_id', '=', orgId)
        .where('id', '=', broadcastId)
        .executeTakeFirst();
      if (!broadcast) throw new NotFoundError();
      const org = await tx
        .selectFrom('orgs')
        .select(['name', 'timezone', 'is_demo'])
        .where('id', '=', orgId)
        .executeTakeFirstOrThrow();
      const rendered = renderBroadcastFor(
        { subject: broadcast.subject, bodyHtml: broadcast.body_html, bodyText: broadcast.body_text },
        { email: body.toAddress, firstName: 'Test', lastName: 'Recipient' },
        { name: org.name, timezone: org.timezone },
      );
      const status = org.is_demo ? 'suppressed' : 'pending';
      const out = await tx
        .insertInto('notifications_outbox')
        .values({
          org_id: orgId,
          to_address: body.toAddress,
          template_key: 'broadcast.generic',
          rendered_subject: rendered.subject,
          rendered_html: rendered.html,
          rendered_text: rendered.text,
          payload: JSON.stringify({ broadcastId, __test: true }),
          status,
        })
        .returning(['id'])
        .executeTakeFirstOrThrow();
      await audit({
        action: 'broadcast.test_sent',
        targetType: 'broadcast',
        targetId: broadcastId,
        diff: { after: { toAddress: body.toAddress } },
      });
      return { data: { notificationId: out.id, status } };
    });
  });

  app.post('/api/v1/orgs/:orgId/broadcasts/:broadcastId/send', async (req) => {
    const { orgId, broadcastId } = broadcastIdParamSchema.parse(req.params);
    await req.requirePermission(orgId, 'broadcasts.send');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      // Atomic claim: only succeed if the broadcast is currently a draft.
      // Repeated send attempts hit this guard and 409 instead of fanning out
      // duplicate outbox rows.
      const claimed = await tx
        .updateTable('broadcasts')
        .set({ status: 'sending', updated_at: new Date() })
        .where('org_id', '=', orgId)
        .where('id', '=', broadcastId)
        .where('status', '=', 'draft')
        .returningAll()
        .executeTakeFirst();
      if (!claimed) {
        const exists = await tx
          .selectFrom('broadcasts')
          .select(['status'])
          .where('org_id', '=', orgId)
          .where('id', '=', broadcastId)
          .executeTakeFirst();
        if (!exists) throw new NotFoundError();
        throw new ConflictError(`Broadcast cannot be sent from status "${exists.status}".`);
      }

      const org = await tx
        .selectFrom('orgs')
        .select(['name', 'timezone', 'is_demo'])
        .where('id', '=', orgId)
        .executeTakeFirstOrThrow();
      const recipients = await resolveBroadcastRecipients(tx, orgId, claimed.segment_id);
      // Defensive cap until the chunked-fan-out worker exists. Without this, a
      // segment that grew unexpectedly large can keep the request transaction
      // open long enough to hit Postgres statement_timeout, which would roll
      // back the claim mid-flight.
      const MAX_RECIPIENTS_PER_SEND = 5000;
      if (recipients.length > MAX_RECIPIENTS_PER_SEND) {
        throw new ConflictError(
          `Segment has ${recipients.length} recipients; the per-broadcast cap is ${MAX_RECIPIENTS_PER_SEND}. Narrow the segment or split the broadcast.`,
        );
      }
      const suppressedAddrs = new Set(
        (
          await tx
            .selectFrom('notification_suppressions')
            .select(['address'])
            .where('org_id', '=', orgId)
            .execute()
        ).map((r) => r.address.toLowerCase()),
      );

      let queued = 0;
      const seen = new Set<string>();
      for (const r of recipients) {
        const addr = r.email.toLowerCase();
        if (seen.has(addr)) continue;
        seen.add(addr);
        const rendered = renderBroadcastFor(
          { subject: claimed.subject, bodyHtml: claimed.body_html, bodyText: claimed.body_text },
          { email: r.email, firstName: r.firstName, lastName: r.lastName },
          { name: org.name, timezone: org.timezone },
        );
        const status = org.is_demo || suppressedAddrs.has(addr) ? 'suppressed' : 'pending';
        await tx
          .insertInto('notifications_outbox')
          .values({
            org_id: orgId,
            to_address: r.email,
            template_key: 'broadcast.generic',
            rendered_subject: rendered.subject,
            rendered_html: rendered.html,
            rendered_text: rendered.text,
            payload: JSON.stringify({ broadcastId, visitorId: r.visitorId }),
            status,
          })
          .execute();
        queued += 1;
      }

      const updated = await tx
        .updateTable('broadcasts')
        .set({
          status: 'sent',
          recipient_count: queued,
          sent_at: new Date(),
          updated_at: new Date(),
        })
        .where('org_id', '=', orgId)
        .where('id', '=', broadcastId)
        .returningAll()
        .executeTakeFirstOrThrow();

      await audit({
        action: 'broadcast.sent',
        targetType: 'broadcast',
        targetId: broadcastId,
        diff: { after: { recipientCount: queued, segmentId: claimed.segment_id } },
      });

      return { data: publicBroadcast(updated) };
    });
  });
}
