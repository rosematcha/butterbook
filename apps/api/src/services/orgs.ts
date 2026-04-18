import { DEFAULT_FORM_FIELDS } from '@butterbook/shared';
import { getDb, withGlobalContext, type Tx } from '../db/index.js';
import { ConflictError } from '../errors/index.js';
import type { ActorContext } from '@butterbook/shared';

export async function createOrgWithOwner(input: {
  name: string;
  address: string;
  zip: string;
  timezone: string;
  publicSlug: string;
  ownerUserId: string;
  actor: ActorContext;
}): Promise<{ orgId: string; memberId: string; locationId: string }> {
  const db = getDb();
  const slugInUse = await db.selectFrom('orgs').select('id').where('public_slug', '=', input.publicSlug).executeTakeFirst();
  if (slugInUse) throw new ConflictError('publicSlug already in use.');

  return withGlobalContext(async (tx) => {
    const org = await tx
      .insertInto('orgs')
      .values({
        name: input.name,
        address: input.address,
        zip: input.zip,
        timezone: input.timezone,
        public_slug: input.publicSlug,
        form_fields: JSON.stringify(DEFAULT_FORM_FIELDS),
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    const member = await tx
      .insertInto('org_members')
      .values({ org_id: org.id, user_id: input.ownerUserId, is_superadmin: true })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    const location = await tx
      .insertInto('locations')
      .values({ org_id: org.id, name: input.name, is_primary: true, address: input.address, zip: input.zip })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    await tx.insertInto('audit_log').values({
      org_id: org.id,
      actor_id: input.actor.userId,
      actor_type: input.actor.actorType,
      action: 'org.created',
      target_type: 'org',
      target_id: org.id,
      diff: { after: { name: input.name, publicSlug: input.publicSlug } },
      ip_address: input.actor.ip,
      user_agent: input.actor.userAgent,
    }).execute();

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
