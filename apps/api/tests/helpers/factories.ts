import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';
import { getDb } from '../../src/db/index.js';
import { hashPassword } from '../../src/utils/passwords.js';
import { createOrgWithOwner } from '../../src/services/orgs.js';

export async function makeApp(): Promise<FastifyInstance> {
  return buildApp();
}

export async function truncateAll(): Promise<void> {
  const db = getDb();
  await db.deleteFrom('audit_log').execute();
  await db.deleteFrom('idempotency_keys').execute();
  await db.deleteFrom('waitlist_entries').execute();
  await db.deleteFrom('visits').execute();
  await db.deleteFrom('events').execute();
  await db.deleteFrom('invitations').execute();
  await db.deleteFrom('member_roles').execute();
  await db.deleteFrom('role_permissions').execute();
  await db.deleteFrom('roles').execute();
  await db.deleteFrom('org_members').execute();
  await db.deleteFrom('sessions').execute();
  await db.deleteFrom('closed_days').execute();
  await db.deleteFrom('location_hour_overrides').execute();
  await db.deleteFrom('location_hours').execute();
  await db.deleteFrom('locations').execute();
  await db.deleteFrom('orgs').execute();
  await db.deleteFrom('users').execute();
}

export async function createUser(email: string, password = 'longenoughpass1234'): Promise<string> {
  const hash = await hashPassword(password);
  const row = await getDb().insertInto('users').values({ email: email.toLowerCase(), password_hash: hash }).returning(['id']).executeTakeFirstOrThrow();
  return row.id;
}

export async function createTestOrg(ownerEmail = 'owner@example.com'): Promise<{ orgId: string; userId: string; locationId: string }> {
  const userId = await createUser(ownerEmail);
  const r = await createOrgWithOwner({
    name: 'Test Museum',
    address: '1 Test Way',
    zip: '10001',
    timezone: 'America/New_York',
    publicSlug: `org-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    ownerUserId: userId,
    actor: {
      userId,
      orgId: null,
      isSuperadmin: true,
      permissions: new Set(),
      actorType: 'system',
      ip: null,
      userAgent: 'test',
    },
  });
  return { orgId: r.orgId, userId, locationId: r.locationId };
}

export async function loginToken(app: FastifyInstance, email: string, password = 'longenoughpass1234'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
  });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  return (JSON.parse(res.body) as { data: { token: string } }).data.token;
}
