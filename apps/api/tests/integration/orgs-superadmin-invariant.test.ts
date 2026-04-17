import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { getDb } from '../../src/db/index.js';

describe('superadmin invariant', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await makeApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await truncateAll(); });

  it('refuses to demote the last superadmin', async () => {
    const { orgId, userId } = await createTestOrg('solo@example.com');
    const token = await loginToken(app, 'solo@example.com');
    const members = await getDb().selectFrom('org_members').select(['id']).where('user_id', '=', userId).where('org_id', '=', orgId).execute();
    const memberId = members[0]!.id;
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/orgs/${orgId}/members/${memberId}/superadmin`,
      headers: { authorization: `Bearer ${token}` },
      payload: { isSuperadmin: false },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).type).toContain('superadmin_invariant');
  });
});
