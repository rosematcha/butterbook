import { Kysely, PostgresDialect, sql, type Transaction } from 'kysely';
import pg from 'pg';
import type { DB } from './types.js';
import type { ActorContext, AuditEntryInput } from '@butterbook/shared';
import { getConfig } from '../config.js';
import { QueryMetricsPlugin } from './metrics-plugin.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;
let cachedDb: Kysely<DB> | null = null;

export function getPool(): pg.Pool {
  if (pool) return pool;
  const cfg = getConfig();
  pool = new Pool({
    connectionString: cfg.DATABASE_URL,
    max: cfg.DATABASE_POOL_SIZE,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });
  return pool;
}

export function getDb(): Kysely<DB> {
  if (cachedDb) return cachedDb;
  cachedDb = new Kysely<DB>({
    dialect: new PostgresDialect({ pool: getPool() }),
    plugins: [new QueryMetricsPlugin()],
  });
  return cachedDb;
}

export async function closeDb(): Promise<void> {
  if (cachedDb) await cachedDb.destroy();
  cachedDb = null;
  if (pool) await pool.end();
  pool = null;
}

export type Tx = Transaction<DB>;

export interface TenantContext {
  tx: Tx;
  orgId: string;
  actor: ActorContext;
  audit: (entry: AuditEntryInput) => Promise<void>;
}

// Single entry point for tenant-scoped mutations / queries.
// Sets app.current_org_id for RLS and provides an audit() helper that writes
// inside the same transaction.
export async function withOrgContext<T>(
  orgId: string,
  actor: ActorContext,
  fn: (ctx: TenantContext) => Promise<T>,
): Promise<T> {
  return getDb()
    .transaction()
    .execute(async (tx) => {
      await sql`SELECT set_config('app.current_org_id', ${orgId}, true)`.execute(tx);
      const ctx: TenantContext = {
        tx,
        orgId,
        actor,
        audit: (entry) => writeAudit(tx, orgId, actor, entry),
      };
      return fn(ctx);
    });
}

// Tenant-less transaction (users, sessions, orgs creation). Callers must supply
// their own org_id WHERE clauses — this helper does not set the RLS session var.
export async function withGlobalContext<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction().execute(async (tx) => fn(tx));
}

// Read-only tenant-scoped transaction. Same RLS guarantee as withOrgContext:
// `app.current_org_id` is set, so RLS restricts every SELECT to `orgId`.
// Use this from every list/detail handler that touches tenant-scoped tables.
// No audit helper is exposed — reads must not write audit entries.
export async function withOrgRead<T>(orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb()
    .transaction()
    .execute(async (tx) => {
      // Single round-trip: set_config('transaction_read_only','on',true) is equivalent to
      // SET LOCAL transaction_read_only = on (i.e. SET TRANSACTION READ ONLY) when inside a tx.
      await sql`SELECT set_config('app.current_org_id', ${orgId}, true),
                       set_config('transaction_read_only', 'on', true)`.execute(tx);
      return fn(tx);
    });
}

export async function writeAudit(
  tx: Tx,
  orgId: string | null,
  actor: ActorContext,
  entry: AuditEntryInput,
): Promise<void> {
  await tx
    .insertInto('audit_log')
    .values({
      org_id: orgId,
      actor_id: actor.userId,
      actor_type: actor.actorType,
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId,
      diff: entry.diff ?? null,
      ip_address: actor.ip,
      user_agent: actor.userAgent,
    })
    .execute();
}

export { sql };
