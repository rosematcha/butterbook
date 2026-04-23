import { DEFAULT_FORM_FIELDS, type FormField } from '@butterbook/shared';
import { getDb, withGlobalContext, type Tx } from '../db/index.js';
import { ConflictError } from '../errors/index.js';
import type { ActorContext } from '@butterbook/shared';
import { DEFAULT_TEMPLATES } from './notifications/default-templates.js';

export async function createOrgWithOwner(input: {
  name: string;
  address: string;
  zip: string;
  timezone: string;
  publicSlug: string;
  ownerUserId: string;
  actor: ActorContext;
  country?: string;
  city?: string | null;
  state?: string | null;
  terminology?: 'appointment' | 'visit';
  timeModel?: 'start_end' | 'start_only' | 'untimed';
  formFields?: FormField[];
}): Promise<{ orgId: string; memberId: string; locationId: string }> {
  const db = getDb();
  const slugInUse = await db.selectFrom('orgs').select('id').where('public_slug', '=', input.publicSlug).executeTakeFirst();
  if (slugInUse) throw new ConflictError('publicSlug already in use.');

  return withGlobalContext(async (tx) => {
    const orgValues: Record<string, unknown> = {
      name: input.name,
      address: input.address,
      zip: input.zip,
      timezone: input.timezone,
      public_slug: input.publicSlug,
      form_fields: JSON.stringify(input.formFields ?? DEFAULT_FORM_FIELDS),
    };
    if (input.country !== undefined) orgValues.country = input.country;
    if (input.city !== undefined) orgValues.city = input.city;
    if (input.state !== undefined) orgValues.state = input.state;
    if (input.terminology !== undefined) orgValues.terminology = input.terminology;
    if (input.timeModel !== undefined) orgValues.time_model = input.timeModel;

    const org = await tx
      .insertInto('orgs')
      .values(orgValues as never)
      .returning(['id'])
      .executeTakeFirstOrThrow();

    const member = await tx
      .insertInto('org_members')
      .values({ org_id: org.id, user_id: input.ownerUserId, is_superadmin: true })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    const location = await tx
      .insertInto('locations')
      .values({
        org_id: org.id,
        name: input.name,
        is_primary: true,
        address: input.address,
        zip: input.zip,
        country: input.country ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    await tx.insertInto('audit_log').values({
      org_id: org.id,
      actor_id: input.actor.userId,
      actor_type: input.actor.actorType,
      action: 'org.created',
      target_type: 'org',
      target_id: org.id,
      diff: {
        after: {
          name: input.name,
          publicSlug: input.publicSlug,
          ...(input.country !== undefined ? { country: input.country } : {}),
          ...(input.city !== undefined ? { city: input.city } : {}),
          ...(input.state !== undefined ? { state: input.state } : {}),
          ...(input.terminology !== undefined ? { terminology: input.terminology } : {}),
          ...(input.timeModel !== undefined ? { timeModel: input.timeModel } : {}),
        },
      },
      ip_address: input.actor.ip,
      user_agent: input.actor.userAgent,
    }).execute();

    // Seed default notification templates. Migration 008 backfills templates
    // for pre-existing orgs; this keeps new orgs in sync with the same set.
    await tx
      .insertInto('notification_templates')
      .values(
        DEFAULT_TEMPLATES.map((t) => ({
          org_id: org.id,
          template_key: t.templateKey,
          subject: t.subject,
          body_html: t.bodyHtml,
          body_text: t.bodyText,
        })),
      )
      .execute();

    // Seed default booking policy (self-cancel on, self-reschedule off, 2h cutoffs).
    await tx
      .insertInto('org_booking_policies')
      .values({ org_id: org.id })
      .execute();

    return { orgId: org.id, memberId: member.id, locationId: location.id };
  });
}

// Must run inside an already-open tenant-scoped transaction (either withOrgContext
// or withOrgRead) so RLS enforces the org boundary on the count. Passing `tx` makes
// this composable into the superadmin-demotion mutation without a nested transaction.
export async function countSuperadminsForOrg(tx: Tx, orgId: string): Promise<number> {
  const row = await tx
    .selectFrom('org_members')
    .select((eb) => eb.fn.countAll<number>().as('c'))
    .where('org_id', '=', orgId)
    .where('is_superadmin', '=', true)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return Number(row?.c ?? 0);
}
