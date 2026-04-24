import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from 'kysely';
import { getDb, type Tx } from '../db/index.js';
import { NotFoundError } from '../errors/index.js';

const orgParam = z.object({ orgId: z.string().uuid() });

// Tables dumped in the export. Order chosen so a consumer can reconstruct
// referential integrity (orgs → locations → hours/overrides/closed_days →
// members/roles/permissions → event_series → events → visits/waitlist →
// invitations → contacts → memberships → audit_log).
const EXPORT_SECTIONS = [
  'locations',
  'location_hours',
  'location_hour_overrides',
  'closed_days',
  'org_members',
  'roles',
  'role_permissions',
  'member_roles',
  'event_series',
  'events',
  'visits',
  'waitlist_entries',
  'invitations',
  'visitors',
  'visitor_segments',
  'org_membership_policies',
  'membership_tiers',
  'memberships',
  'membership_payments',
  'guest_passes',
  'org_stripe_accounts',
  'stripe_events',
  'audit_log',
] as const;
type ExportSection = (typeof EXPORT_SECTIONS)[number];

const PAGE_SIZE = 1000;

export function registerOrgExportRoutes(app: FastifyInstance): void {
  app.get('/api/v1/orgs/:orgId/export', async (req, reply) => {
    const { orgId } = orgParam.parse(req.params);
    await req.requireSuperadmin(orgId);

    const org = await getDb()
      .selectFrom('orgs')
      .selectAll()
      .where('id', '=', orgId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!org) throw new NotFoundError();

    reply
      .type('application/json; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="org-${orgId}.json"`);

    // Hijack the raw socket so we can stream bytes while a long-lived tenant-scoped
    // read-only transaction is open. The transaction enforces RLS isolation across
    // every pagination page.
    reply.hijack();
    const raw = reply.raw;
    const write = (chunk: string): void => {
      raw.write(chunk);
    };

    try {
      raw.statusCode = 200;
      raw.setHeader('Content-Type', 'application/json; charset=utf-8');
      raw.setHeader('Content-Disposition', `attachment; filename="org-${orgId}.json"`);

      write('{"exportedAt":' + JSON.stringify(new Date().toISOString()));
      write(',"org":' + JSON.stringify(org));

      await getDb()
        .transaction()
        .execute(async (tx) => {
          await sql`SET TRANSACTION READ ONLY`.execute(tx);
          await sql`SELECT set_config('app.current_org_id', ${orgId}, true)`.execute(tx);
          for (const section of EXPORT_SECTIONS) {
            write(`,"${section}":[`);
            let first = true;
            let offset = 0;
            for (;;) {
              const rows = await pageSection(tx, section, offset, PAGE_SIZE);
              for (const row of rows) {
                if (!first) write(',');
                first = false;
                write(JSON.stringify(row));
              }
              if (rows.length < PAGE_SIZE) break;
              offset += PAGE_SIZE;
            }
            write(']');
          }
        });

      write('}');
      raw.end();
    } catch (err) {
      // Can't throw normally after hijack — emit a trailer and close.
      req.log.error({ err }, 'org export stream failed');
      try {
        raw.write(',"_error":"stream_aborted"}');
      } catch {
        /* already closed */
      }
      raw.end();
    }
  });
}

async function pageSection(tx: Tx, section: ExportSection, offset: number, limit: number): Promise<Array<Record<string, unknown>>> {
  // Kysely's table name is a literal type; build per-section queries.
  switch (section) {
    case 'locations':
      return tx.selectFrom('locations').selectAll().limit(limit).offset(offset).execute() as unknown as Array<Record<string, unknown>>;
    case 'location_hours':
      return tx.selectFrom('location_hours').selectAll().limit(limit).offset(offset).execute() as unknown as Array<Record<string, unknown>>;
    case 'location_hour_overrides':
      return tx.selectFrom('location_hour_overrides').selectAll().limit(limit).offset(offset).execute() as unknown as Array<Record<string, unknown>>;
    case 'closed_days':
      return tx.selectFrom('closed_days').selectAll().limit(limit).offset(offset).execute() as unknown as Array<Record<string, unknown>>;
    case 'org_members':
      return tx.selectFrom('org_members').selectAll().limit(limit).offset(offset).execute() as unknown as Array<Record<string, unknown>>;
    case 'roles':
      return tx.selectFrom('roles').selectAll().limit(limit).offset(offset).execute() as unknown as Array<Record<string, unknown>>;
    case 'role_permissions':
      return tx.selectFrom('role_permissions').selectAll().limit(limit).offset(offset).execute() as unknown as Array<Record<string, unknown>>;
    case 'member_roles':
      return tx.selectFrom('member_roles').selectAll().limit(limit).offset(offset).execute() as unknown as Array<Record<string, unknown>>;
    case 'event_series':
      return tx.selectFrom('event_series').selectAll().limit(limit).offset(offset).execute() as unknown as Array<Record<string, unknown>>;
    case 'events':
      return tx.selectFrom('events').selectAll().limit(limit).offset(offset).execute() as unknown as Array<Record<string, unknown>>;
    case 'visits':
      return tx.selectFrom('visits').selectAll().limit(limit).offset(offset).execute() as unknown as Array<Record<string, unknown>>;
    case 'waitlist_entries':
      return tx.selectFrom('waitlist_entries').selectAll().limit(limit).offset(offset).execute() as unknown as Array<Record<string, unknown>>;
    case 'invitations':
      return tx.selectFrom('invitations').selectAll().limit(limit).offset(offset).execute() as unknown as Array<Record<string, unknown>>;
    case 'visitors':
      return tx.selectFrom('visitors').selectAll().limit(limit).offset(offset).execute() as unknown as Array<Record<string, unknown>>;
    case 'visitor_segments':
      return tx.selectFrom('visitor_segments').selectAll().limit(limit).offset(offset).execute() as unknown as Array<Record<string, unknown>>;
    case 'org_membership_policies':
      return tx.selectFrom('org_membership_policies').selectAll().limit(limit).offset(offset).execute() as unknown as Array<Record<string, unknown>>;
    case 'membership_tiers':
      return tx.selectFrom('membership_tiers').selectAll().limit(limit).offset(offset).execute() as unknown as Array<Record<string, unknown>>;
    case 'memberships':
      return tx.selectFrom('memberships').selectAll().limit(limit).offset(offset).execute() as unknown as Array<Record<string, unknown>>;
    case 'membership_payments':
      return tx.selectFrom('membership_payments').selectAll().limit(limit).offset(offset).execute() as unknown as Array<Record<string, unknown>>;
    case 'guest_passes':
      return tx.selectFrom('guest_passes').selectAll().limit(limit).offset(offset).execute() as unknown as Array<Record<string, unknown>>;
    case 'org_stripe_accounts':
      return tx
        .selectFrom('org_stripe_accounts')
        .select(['org_id', 'stripe_account_id', 'charges_enabled', 'payouts_enabled', 'default_currency', 'connected_at', 'disconnected_at', 'updated_at'])
        .limit(limit)
        .offset(offset)
        .execute() as unknown as Array<Record<string, unknown>>;
    case 'stripe_events':
      return tx.selectFrom('stripe_events').selectAll().limit(limit).offset(offset).execute() as unknown as Array<Record<string, unknown>>;
    case 'audit_log':
      return tx.selectFrom('audit_log').selectAll().limit(limit).offset(offset).execute() as unknown as Array<Record<string, unknown>>;
  }
}
