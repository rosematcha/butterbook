import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, createUser, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { getDb } from '../../src/db/index.js';

describe('permission gating', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await truncateAll();
  });

  it('401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('403 when member lacks required permission', async () => {
    const { orgId } = await createTestOrg('owner@example.com');
    const otherUserId = await createUser('other@example.com');
    // Add other user as non-superadmin with no roles.
    await getDb().insertInto('org_members').values({ org_id: orgId, user_id: otherUserId, is_superadmin: false }).execute();

    const token = await loginToken(app, 'other@example.com');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/members`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('superadmin can list members', async () => {
    const { orgId } = await createTestOrg('owner2@example.com');
    const token = await loginToken(app, 'owner2@example.com');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/members`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });
});
