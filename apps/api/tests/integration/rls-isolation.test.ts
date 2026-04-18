import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { getDb, sql } from '../../src/db/index.js';

// Proves the RLS policies defined in 001_init.sql actually filter cross-tenant
// reads when the connection is a non-BYPASSRLS role (as in production).
//
// CI runs as the `postgres` superuser which unconditionally bypasses RLS, so
// we provision a dedicated NOBYPASSRLS role inside this suite and SET LOCAL
// ROLE to it for the duration of the scoped transaction. This mirrors the
// production assumption ("The application role must NOT have BYPASSRLS").
const APP_USER = 'butterbook_test_app_user';

describe('RLS cross-tenant isolation', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await makeApp();
    const db = getDb();
    // APP_USER is a hardcoded constant so sql.raw is safe here. We can't use
    // bind parameters for role names (CREATE ROLE, SET ROLE, and GRANT all
    // require bare identifiers, not values).
    const exists = await sql<{ rolname: string }>`SELECT rolname FROM pg_roles WHERE rolname = ${APP_USER}`.execute(db);
    if (exists.rows.length === 0) {
      await sql.raw(`CREATE ROLE ${APP_USER} NOLOGIN NOBYPASSRLS`).execute(db);
    }
    await sql.raw(`GRANT USAGE ON SCHEMA public TO ${APP_USER}`).execute(db);
    await sql.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_USER}`).execute(db);
  });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await truncateAll(); });

  it('RLS hides other-org locations when connection is NOBYPASSRLS', async () => {
    const a = await createTestOrg('a@ex.com');
    const b = await createTestOrg('b@ex.com');

    const tokenA = await loginToken(app, 'a@ex.com');
    const tokenB = await loginToken(app, 'b@ex.com');
    const r1 = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${a.orgId}/locations`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { name: 'Only-A' },
    });
    expect(r1.statusCode).toBe(200);
    const r2 = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${b.orgId}/locations`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: { name: 'Only-B' },
    });
    expect(r2.statusCode).toBe(200);

    // Run the scoped read as a NOBYPASSRLS role. Without this, a superuser
    // connection would see every org's rows regardless of the policy.
    const names = await getDb().transaction().execute(async (tx) => {
      await sql.raw(`SET LOCAL ROLE ${APP_USER}`).execute(tx);
      await sql`SELECT set_config('app.current_org_id', ${a.orgId}, true)`.execute(tx);
      const rows = await tx.selectFrom('locations').select(['name']).execute();
      return rows.map((r) => r.name);
    });

    expect(names).toContain('Only-A');
    expect(names.some((n) => n.startsWith('Only-B'))).toBe(false);

    // Sanity: without the RLS context var, getDb() returns rows from both orgs
    // (app-level filtering is the only guard). This is expected by ADR 004.
    const all = await getDb().selectFrom('locations').select(['name']).execute();
    expect(all.map((r) => r.name)).toEqual(
      expect.arrayContaining(['Only-A', 'Only-B']),
    );
  });
});
