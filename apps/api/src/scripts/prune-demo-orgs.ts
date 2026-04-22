#!/usr/bin/env tsx
// Cron-run pruner for the demo instance.
//
// Intended to run hourly via Coolify's scheduled-tasks feature on the demo API
// container. Two jobs:
//
//   1. Hard-delete demo orgs whose row hasn't been touched in
//      DEMO_SESSION_TTL_HOURS. The app deliberately doesn't soft-delete here —
//      soft-deleting would leave the data on disk indefinitely, which is the
//      opposite of the point. Because every child table has ON DELETE RESTRICT
//      on org_id, we walk the dependency graph explicitly inside one tx per
//      org, in RLS-scoped bypass (superuser role via the migration user).
//
//   2. Per live demo org, ring-buffer the audit_log to the newest 2000 rows.
//      A visitor who clicks on everything can push audit counts into the
//      thousands over a single 12h window, and we'd rather not carry that.
//      audit_log is append-only at the app level (a trigger refuses UPDATE/
//      DELETE from normal roles), but the migration role is exempt — we run
//      the DELETE directly on the pool without a tx-scoped RLS var.
//
// Called via:
//   pnpm --filter api run prune:demo
// or the compiled `node dist/scripts/prune-demo-orgs.js`.

import { sql } from 'kysely';
import { loadConfig } from '../config.js';
import { closeDb, getDb } from '../db/index.js';

const AUDIT_CAP_PER_DEMO_ORG = 2000;

async function deleteExpiredOrgs(ttlHours: number): Promise<number> {
  const db = getDb();
  const cutoffMs = Date.now() - ttlHours * 60 * 60 * 1000;
  const cutoff = new Date(cutoffMs);

  const expired = await db
    .selectFrom('orgs')
    .select(['id'])
    .where('is_demo', '=', true)
    .where('updated_at', '<', cutoff)
    .execute();

  if (expired.length === 0) return 0;

  for (const { id: orgId } of expired) {
    // One transaction per org. We walk children before the org so RESTRICT
    // FKs don't fire. Order matters: member_roles depends on org_members;
    // role_permissions depends on roles; waitlist_entries depends on events;
    // visits reference events and locations.
    await db.transaction().execute(async (tx) => {
      // Flip the audit-delete gate inside this tx only. The audit trigger
      // (migration 005) checks this GUC and an is_demo orgs row — so even
      // with the GUC set, a non-demo org_id's audit rows stay protected.
      await sql`SELECT set_config('app.allow_audit_delete_demo', 'on', true)`.execute(tx);
      // Grab dependent IDs up-front so we can delete junction rows even though
      // app.current_org_id isn't set (RLS passes through when unset).
      const orgMembers = await tx.selectFrom('org_members').select('id').where('org_id', '=', orgId).execute();
      const memberIds = orgMembers.map((m) => m.id);
      const roles = await tx.selectFrom('roles').select('id').where('org_id', '=', orgId).execute();
      const roleIds = roles.map((r) => r.id);
      const locations = await tx.selectFrom('locations').select('id').where('org_id', '=', orgId).execute();
      const locationIds = locations.map((l) => l.id);
      // The ephemeral admin user: the only user whose id appears in this org's
      // org_members row flagged is_superadmin=true. We remember it now so we
      // can delete the row after the membership is gone.
      const ephemeralUserRow = await tx
        .selectFrom('org_members')
        .select('user_id')
        .where('org_id', '=', orgId)
        .where('is_superadmin', '=', true)
        .executeTakeFirst();

      if (memberIds.length > 0) {
        await tx.deleteFrom('member_roles').where('org_member_id', 'in', memberIds).execute();
      }
      if (roleIds.length > 0) {
        await tx.deleteFrom('role_permissions').where('role_id', 'in', roleIds).execute();
      }
      await tx.deleteFrom('waitlist_entries').where('org_id', '=', orgId).execute();
      await tx.deleteFrom('visits').where('org_id', '=', orgId).execute();
      await tx.deleteFrom('events').where('org_id', '=', orgId).execute();
      if (locationIds.length > 0) {
        await tx.deleteFrom('closed_days').where('location_id', 'in', locationIds).execute();
        await tx.deleteFrom('location_hour_overrides').where('location_id', 'in', locationIds).execute();
        await tx.deleteFrom('location_hours').where('location_id', 'in', locationIds).execute();
      }
      await tx.deleteFrom('invitations').where('org_id', '=', orgId).execute();
      await tx.deleteFrom('idempotency_keys').where('org_id', '=', orgId).execute();
      // audit_log's trigger refuses DELETE from non-superuser roles; the
      // migration role (which this script runs as) is exempt, but we still
      // need to SET LOCAL to bypass if RLS is set. Here current_org_id is
      // NULL so the policy passes through.
      await tx.deleteFrom('audit_log').where('org_id', '=', orgId).execute();
      await tx.deleteFrom('org_members').where('org_id', '=', orgId).execute();
      await tx.deleteFrom('locations').where('org_id', '=', orgId).execute();
      await tx.deleteFrom('roles').where('org_id', '=', orgId).execute();
      await tx.deleteFrom('orgs').where('id', '=', orgId).execute();

      if (ephemeralUserRow?.user_id) {
        // Revoke sessions first so the FK from sessions.user_id (ON DELETE
        // RESTRICT) doesn't block the user row. We delete outright since the
        // user is single-use anyway.
        await tx.deleteFrom('sessions').where('user_id', '=', ephemeralUserRow.user_id).execute();
        await tx
          .deleteFrom('users')
          .where('id', '=', ephemeralUserRow.user_id)
          .where('email', 'like', 'demo-%@whitman.demo')
          .execute();
      }
    });
  }
  return expired.length;
}

async function trimAuditLog(): Promise<number> {
  const db = getDb();
  const liveOrgs = await db
    .selectFrom('orgs')
    .select('id')
    .where('is_demo', '=', true)
    .where('deleted_at', 'is', null)
    .execute();
  let totalTrimmed = 0;
  for (const { id: orgId } of liveOrgs) {
    // DELETE where NOT IN (newest N). Keyset pagination would be fancier;
    // audit_log's (org_id, created_at DESC) index makes this cheap enough.
    const trimmed = await db.transaction().execute(async (tx) => {
      await sql`SELECT set_config('app.allow_audit_delete_demo', 'on', true)`.execute(tx);
      const result = await sql<{ trimmed: number }>`
        WITH keep AS (
          SELECT id FROM audit_log
          WHERE org_id = ${orgId}
          ORDER BY created_at DESC
          LIMIT ${AUDIT_CAP_PER_DEMO_ORG}
        )
        DELETE FROM audit_log
        WHERE org_id = ${orgId}
          AND id NOT IN (SELECT id FROM keep)
        RETURNING 1 AS trimmed
      `.execute(tx);
      return result.rows.length;
    });
    totalTrimmed += trimmed;
  }
  return totalTrimmed;
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const deleted = await deleteExpiredOrgs(cfg.DEMO_SESSION_TTL_HOURS);
  const trimmed = await trimAuditLog();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ prunedOrgs: deleted, trimmedAuditRows: trimmed }));
  await closeDb();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
