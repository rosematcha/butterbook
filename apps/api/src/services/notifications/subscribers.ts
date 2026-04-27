import { getConfig } from '../../config.js';
import { withOrgContext, type Tx } from '../../db/index.js';
import { logger } from '../../utils/logger.js';
import type { ActorContext } from '@butterbook/shared';
import { defaultManageExpiry, makeManageToken } from '../../utils/manage-token.js';
import { defaultUnsubscribeExpiry, makeUnsubscribeToken } from '../../utils/unsubscribe-token.js';
import { renderTemplate } from './render.js';

// System actor used for subscriber work. Subscribers run inside withOrgContext
// so RLS enforces org isolation on the inserts, but there's no authenticated
// user — mark the actor_type as 'system' (audit_log permits this).
function systemActor(orgId: string): ActorContext {
  return {
    userId: null,
    orgId,
    isSuperadmin: false,
    permissions: new Set(),
    actorType: 'system',
    ip: null,
    userAgent: null,
  };
}

function enabled(): boolean {
  const cfg = getConfig();
  return cfg.NOTIFICATIONS_ENABLED;
}

interface Address {
  to: string;
}

function extractEmail(payload: Record<string, unknown>): string | null {
  // Visit/waitlist events put the visitor response under `formResponse`.
  const fr = (payload.formResponse ?? {}) as Record<string, unknown>;
  const candidate =
    (typeof fr.email === 'string' && fr.email) ||
    (typeof payload.inviteeEmail === 'string' && payload.inviteeEmail) ||
    (typeof payload.to === 'string' && payload.to) ||
    null;
  if (!candidate) return null;
  // Loose shape check; real enforcement is the provider rejecting it.
  return candidate.includes('@') ? candidate : null;
}

function extractVisitorName(payload: Record<string, unknown>): string {
  const fr = (payload.formResponse ?? {}) as Record<string, unknown>;
  if (typeof fr.name === 'string' && fr.name.length > 0) return fr.name;
  if (typeof payload.visitorName === 'string' && payload.visitorName.length > 0) return payload.visitorName;
  return 'there';
}

interface EventContext {
  orgId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

// Common preflight: suppression list + demo-org gate. Returns a status when the
// outbox row should be short-circuited ('suppressed' / skipped entirely).
async function preflight(
  tx: Tx,
  orgId: string,
  address: Address,
): Promise<'ok' | 'suppressed' | 'skip'> {
  const org = await tx.selectFrom('orgs').select(['is_demo']).where('id', '=', orgId).executeTakeFirst();
  if (!org) return 'skip';
  if (org.is_demo) return 'suppressed';
  const sup = await tx
    .selectFrom('notification_suppressions')
    .select(['address'])
    .where('org_id', '=', orgId)
    .where('address', '=', address.to.toLowerCase())
    .executeTakeFirst();
  if (sup) return 'suppressed';
  return 'ok';
}

async function enqueueRendered(
  tx: Tx,
  orgId: string,
  templateKey: string,
  address: Address,
  payload: Record<string, unknown>,
  status: 'pending' | 'suppressed',
): Promise<void> {
  const tpl = await tx
    .selectFrom('notification_templates')
    .select(['subject', 'body_html', 'body_text'])
    .where('org_id', '=', orgId)
    .where('template_key', '=', templateKey)
    .executeTakeFirst();
  if (!tpl) {
    logger.warn({ orgId, templateKey }, 'notification.template_missing');
    return;
  }

  const org = await tx.selectFrom('orgs').select(['name', 'timezone']).where('id', '=', orgId).executeTakeFirst();
  // Build the manage URL if the payload references a visit. For reschedule/
  // cancellation templates the URL is meaningless, but Handlebars strict mode
  // requires the variable to be defined — empty string still resolves
  // `{{#if manageUrl}}` to false.
  let manageUrl = '';
  const visitId = typeof payload.visitId === 'string' ? payload.visitId : null;
  const scheduledAt = typeof payload.scheduledAt === 'string' ? payload.scheduledAt : null;
  if (visitId && scheduledAt) {
    const token = makeManageToken(visitId, defaultManageExpiry(scheduledAt));
    manageUrl = `${getConfig().APP_BASE_URL}/manage/${token}`;
  }

  // Build unsubscribe URL for every outgoing email.
  const unsubscribeToken = makeUnsubscribeToken(address.to, orgId, defaultUnsubscribeExpiry());
  const unsubscribeUrl = `${getConfig().APP_BASE_URL}/unsubscribe/${unsubscribeToken}`;

  const vars: Record<string, unknown> = {
    ...payload,
    orgName: org?.name ?? '',
    orgTimezone: org?.timezone ?? 'UTC',
    visitorName: extractVisitorName(payload),
    eventName: typeof payload.eventName === 'string' ? payload.eventName : typeof payload.title === 'string' ? payload.title : '',
    eventUrl:
      typeof payload.eventUrl === 'string'
        ? payload.eventUrl
        : typeof payload.slug === 'string' && payload.slug.length > 0
          ? `${getConfig().APP_BASE_URL}/events/${payload.slug}`
          : '',
    inviterName: typeof payload.inviterName === 'string' ? payload.inviterName : 'A team member',
    manageUrl,
    unsubscribeUrl,
    scheduledAtLocal:
      typeof payload.scheduledAt === 'string'
        ? new Intl.DateTimeFormat('en-US', {
            dateStyle: 'full',
            timeStyle: 'short',
            timeZone: org?.timezone ?? 'UTC',
          }).format(new Date(payload.scheduledAt))
        : '',
  };

  let rendered;
  try {
    rendered = renderTemplate(
      { subject: tpl.subject, bodyHtml: tpl.body_html, bodyText: tpl.body_text },
      vars,
    );
  } catch (err) {
    logger.error({ err, orgId, templateKey }, 'notification.render_failed');
    return;
  }

  await tx
    .insertInto('notifications_outbox')
    .values({
      org_id: orgId,
      to_address: address.to,
      template_key: templateKey,
      rendered_subject: rendered.subject,
      rendered_html: rendered.html,
      rendered_text: rendered.text,
      payload: JSON.stringify(payload),
      status,
    })
    .execute();
}

async function runSubscriber(ctx: EventContext, templateKey: string): Promise<void> {
  if (!enabled()) return;
  const address = extractEmail(ctx.payload);
  if (!address) {
    logger.info({ orgId: ctx.orgId, eventType: ctx.eventType }, 'notification.skipped_no_email');
    return;
  }
  await withOrgContext(ctx.orgId, systemActor(ctx.orgId), async ({ tx }) => {
    const pre = await preflight(tx, ctx.orgId, { to: address });
    if (pre === 'skip') return;
    const status = pre === 'suppressed' ? 'suppressed' : 'pending';
    await enqueueRendered(tx, ctx.orgId, templateKey, { to: address }, ctx.payload, status);
  });
}

export type SubscriberFn = (ctx: EventContext) => Promise<void>;

export const SUBSCRIBERS: Record<string, SubscriberFn> = {
  'visit.created': (ctx) => runSubscriber(ctx, 'visit.confirmation'),
  'visit.self_booked': (ctx) => runSubscriber(ctx, 'visit.confirmation'),
  'visit.cancelled': (ctx) => runSubscriber(ctx, 'visit.cancelled'),
  'visit.rescheduled': (ctx) => runSubscriber(ctx, 'visit.rescheduled'),
  'waitlist.promoted': (ctx) => runSubscriber(ctx, 'waitlist.promoted'),
  'waitlist.auto_promoted': (ctx) => runSubscriber(ctx, 'waitlist.promoted'),
  'event.published': (ctx) => runSubscriber(ctx, 'event.published'),
  'invitation.created': (ctx) => runSubscriber(ctx, 'invitation.created'),
  'membership.created': (ctx) => runSubscriber(ctx, 'membership.welcome'),
  'membership.renewed': (ctx) => runSubscriber(ctx, 'membership.welcome'),
  'membership.cancelled': (ctx) => runSubscriber(ctx, 'membership.cancelled'),
  'membership.renewal_reminder': (ctx) => runSubscriber(ctx, 'membership.renewal_reminder'),
  'membership.expired': (ctx) => runSubscriber(ctx, 'membership.expired'),
  'membership.lapsed': (ctx) => runSubscriber(ctx, 'membership.lapsed'),
  'membership.payment_failed': (ctx) => runSubscriber(ctx, 'membership.payment_failed'),
};
