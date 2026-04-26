import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, createUser, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { getDb } from '../../src/db/index.js';

describe('scoped location-specific permissions', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await makeApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await truncateAll(); });

  it('member with visits.view_all scoped to location-A cannot see visits at location-B', async () => {
    const { orgId, locationId: locA, userId: ownerId } = await createTestOrg('scope-owner@example.com');
    const ownerToken = await loginToken(app, 'scope-owner@example.com');

    // Create location B
    const createLocRes = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/locations`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'Gallery B' },
    });
    expect(createLocRes.statusCode).toBe(200);
    const locB = JSON.parse(createLocRes.body).data.id;

    // Create a role with visits.view_all
    const role = await getDb()
      .insertInto('roles')
      .values({ org_id: orgId, name: 'gallery-a-viewer', description: 'Can view visits at Gallery A' })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    await getDb()
      .insertInto('role_permissions')
      .values({ role_id: role.id, permission: 'visits.view_all' })
      .execute();

    // Create a scoped staff user
    const staffId = await createUser('scoped-staff@example.com');
    const staffMember = await getDb()
      .insertInto('org_members')
      .values({ org_id: orgId, user_id: staffId, is_superadmin: false })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    // Assign role scoped to location A only
    await getDb()
      .insertInto('member_roles')
      .values({ org_member_id: staffMember.id, role_id: role.id, scope_location_id: locA })
      .execute();

    const staffToken = await loginToken(app, 'scoped-staff@example.com');

    // Create visits at both locations
    await getDb().insertInto('visits').values({
      org_id: orgId, location_id: locA, booking_method: 'admin',
      scheduled_at: new Date('2026-05-01T10:00:00Z'),
      form_response: { name: 'Alice', zip: '10001', party_size: 1 } as never,
    }).execute();
    await getDb().insertInto('visits').values({
      org_id: orgId, location_id: locB, booking_method: 'admin',
      scheduled_at: new Date('2026-05-01T11:00:00Z'),
      form_response: { name: 'Bob', zip: '10002', party_size: 1 } as never,
    }).execute();

    // Staff can list visits (org-wide) — the requirePermission on the visits
    // list route does NOT pass a locationId, so it checks org-wide first.
    // Without org-wide permission, this should 403.
    const orgWideRes = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/visits`,
      headers: { authorization: `Bearer ${staffToken}` },
    });
    expect(orgWideRes.statusCode).toBe(403);

    // Staff can list visits filtered by location A — if the route passes
    // locationId to requirePermission, the scoped grant would allow it.
    // Currently the visits list route does NOT do this, so this also 403s.
    // This test documents the current behavior: scoped permissions only work
    // when the route explicitly passes locationId to requirePermission.
    const locARes = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/visits?location_id=${locA}`,
      headers: { authorization: `Bearer ${staffToken}` },
    });
    // Without route-level opt-in, scoped members cannot use the visits endpoint
    expect(locARes.statusCode).toBe(403);
  });

  it('member with org-wide visits.view_all can see visits at any location', async () => {
    const { orgId, locationId: locA } = await createTestOrg('orgwide-owner@example.com');

    const role = await getDb()
      .insertInto('roles')
      .values({ org_id: orgId, name: 'viewer', description: 'Org-wide visitor' })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    await getDb()
      .insertInto('role_permissions')
      .values({ role_id: role.id, permission: 'visits.view_all' })
      .execute();

    const staffId = await createUser('orgwide-staff@example.com');
    const staffMember = await getDb()
      .insertInto('org_members')
      .values({ org_id: orgId, user_id: staffId, is_superadmin: false })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    // Org-wide assignment (scope_location_id = null)
    await getDb()
      .insertInto('member_roles')
      .values({ org_member_id: staffMember.id, role_id: role.id })
      .execute();

    const staffToken = await loginToken(app, 'orgwide-staff@example.com');

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/orgs/${orgId}/visits`,
      headers: { authorization: `Bearer ${staffToken}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('loadMembership returns both org-wide and location-scoped permissions', async () => {
    const { orgId, locationId: locA } = await createTestOrg('both-owner@example.com');

    const roleA = await getDb()
      .insertInto('roles')
      .values({ org_id: orgId, name: 'gallery-viewer', description: 'Scoped' })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    await getDb().insertInto('role_permissions').values({ role_id: roleA.id, permission: 'visits.view_all' }).execute();

    const roleB = await getDb()
      .insertInto('roles')
      .values({ org_id: orgId, name: 'reports', description: 'Org-wide reports' })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    await getDb().insertInto('role_permissions').values({ role_id: roleB.id, permission: 'reports.view' }).execute();

    const staffId = await createUser('both-staff@example.com');
    const staffMember = await getDb()
      .insertInto('org_members')
      .values({ org_id: orgId, user_id: staffId, is_superadmin: false })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    await getDb().insertInto('member_roles').values({ org_member_id: staffMember.id, role_id: roleA.id, scope_location_id: locA }).execute();
    await getDb().insertInto('member_roles').values({ org_member_id: staffMember.id, role_id: roleB.id }).execute();

    const { loadMembership } = await import('../../src/auth/permissions.js');
    const m = await loadMembership(staffId, orgId);
    expect(m).not.toBeNull();
    expect(m!.permissions.has('reports.view')).toBe(true);
    expect(m!.permissions.has('visits.view_all')).toBe(false);
    expect(m!.locationPermissions.get(locA)?.has('visits.view_all')).toBe(true);
  });
});
