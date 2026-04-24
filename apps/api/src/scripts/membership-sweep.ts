import { getDb, closeDb, withOrgContext } from '../db/index.js';
import { sweepMembershipStatus } from '../services/memberships.js';
import type { ActorContext } from '@butterbook/shared';

function systemActor(orgId: string): ActorContext {
  return {
    userId: null,
    orgId,
    isSuperadmin: false,
    permissions: new Set(),
    actorType: 'system',
    ip: null,
    userAgent: 'membership-sweep',
  };
}

async function main(): Promise<void> {
  const orgs = await getDb().selectFrom('orgs').select(['id']).where('deleted_at', 'is', null).execute();
  let expired = 0;
  let lapsed = 0;
  for (const org of orgs) {
    const result = await withOrgContext(org.id, systemActor(org.id), async ({ tx, audit }) => {
      const r = await sweepMembershipStatus(tx, org.id);
      if (r.expired > 0 || r.lapsed > 0) {
        await audit({
          action: 'membership.sweep',
          targetType: 'org',
          targetId: org.id,
          diff: { after: r },
        });
      }
      return r;
    });
    expired += result.expired;
    lapsed += result.lapsed;
  }
  console.log(JSON.stringify({ expired, lapsed }));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
