import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, createUser, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { getDb } from '../../src/db/index.js';

// SPEC §1.2 rule 6: soft-deleted records are returned only when
// include_deleted=true AND the caller is a superadmin.
describe('include_deleted gate', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await makeApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await truncateAll(); });

  it('default hides soft-deleted locations', async () => {
    const { orgId, locationId } = await createTestOrg('d@example.com');
    const token = await loginToken(app, 'd@example.com');
    // Create a secondary location, then delete it.
    const add = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/locations`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Secondary' },
    });
    const newLocId = (JSON.parse(add.body) as { data: { id: string } }).data.id;
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/orgs/${orgId}/locations/${newLocId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(del.statusCode).toBe(200);
    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/locations`,
      headers: { authorization: `Bearer ${token}` },
    });
    const rows = (JSON.parse(list.body) as { data: Array<{ id: string }> }).data;
    expect(rows.find((r) => r.id === newLocId)).toBeUndefined();
    expect(rows.find((r) => r.id === locationId)).toBeDefined();
  });

  it('superadmin + include_deleted=true shows soft-deleted rows', async () => {
    const { orgId } = await createTestOrg('d2@example.com');
    const token = await loginToken(app, 'd2@example.com');
    const add = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/locations`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Secondary' },
    });
    const newLocId = (JSON.parse(add.body) as { data: { id: string } }).data.id;
    await app.inject({
      method: 'DELETE',
      url: `/api/v1/orgs/${orgId}/locations/${newLocId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/locations?include_deleted=true`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    const rows = (JSON.parse(list.body) as { data: Array<{ id: string; deletedAt: string | null }> }).data;
    const deleted = rows.find((r) => r.id === newLocId);
    expect(deleted).toBeDefined();
    expect(deleted!.deletedAt).not.toBeNull();
  });

  it('non-superadmin caller cannot use include_deleted (403)', async () => {
    const { orgId } = await createTestOrg('d3@example.com');
    const otherUserId = await createUser('member@example.com');
    // Insert membership and give them admin.manage_users so they can even try the endpoint.
    const m = await getDb()
      .insertInto('org_members')
      .values({ org_id: orgId, user_id: otherUserId, is_superadmin: false })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    const role = await getDb()
      .insertInto('roles')
      .values({ org_id: orgId, name: 'ops' })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    await getDb()
      .insertInto('role_permissions')
      .values({ role_id: role.id, permission: 'admin.manage_users', scope_type: null, scope_id: null })
      .execute();
    await getDb().insertInto('member_roles').values({ org_member_id: m.id, role_id: role.id }).execute();

    const token = await loginToken(app, 'member@example.com');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/members?include_deleted=true`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
