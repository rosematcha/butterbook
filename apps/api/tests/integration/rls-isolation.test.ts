import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { getDb, withOrgRead } from '../../src/db/index.js';

// Proves that withOrgRead (and by extension withOrgContext) does NOT return
// rows from a different org, even with forgotten WHERE clauses.
describe('RLS cross-tenant isolation', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await makeApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await truncateAll(); });

  it('withOrgRead returns only the scoped org rows', async () => {
    const a = await createTestOrg('a@ex.com');
    const b = await createTestOrg('b@ex.com');

    // Put a distinctive location in each org.
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

    // Without RLS context, a forgotten WHERE clause would cross-leak. Prove
    // withOrgRead(a.orgId, ...) cannot see org B's locations even without a
    // where('org_id', '=', ...) clause.
    const seenInA = await withOrgRead(a.orgId, (tx) =>
      tx.selectFrom('locations').select(['name']).execute(),
    );
    const names = seenInA.map((r) => r.name);
    expect(names).toContain('Only-A');
    expect(names.some((n) => n.startsWith('Only-B'))).toBe(false);

    // Sanity: raw getDb() without a context var returns all rows (app-level
    // filtering is the only guard). This is expected by ADR 004.
    const all = await getDb().selectFrom('locations').select(['name']).execute();
    expect(all.map((r) => r.name)).toEqual(
      expect.arrayContaining(['Only-A', 'Only-B']),
    );
  });
});
