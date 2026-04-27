import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, makeApp, truncateAll } from '../helpers/factories.js';
import { getDb } from '../../src/db/index.js';
import { makeUnsubscribeToken, defaultUnsubscribeExpiry } from '../../src/utils/unsubscribe-token.js';

describe('unsubscribe routes', () => {
  let app: FastifyInstance;
  let orgId: string;
  let orgName: string;
  const email = 'visitor@example.com';

  beforeAll(async () => {
    app = await makeApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll();
    const result = await createTestOrg('admin@example.com');
    orgId = result.orgId;
    const org = await getDb().selectFrom('orgs').select(['name']).where('id', '=', orgId).executeTakeFirst();
    orgName = org!.name;
  });

  function token(overrides?: { email?: string; orgId?: string; expiresAt?: number }): string {
    return makeUnsubscribeToken(
      overrides?.email ?? email,
      overrides?.orgId ?? orgId,
      overrides?.expiresAt ?? defaultUnsubscribeExpiry(),
    );
  }

  it('GET returns email and org name', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/notifications/unsubscribe?token=${token()}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.email).toBe(email);
    expect(body.orgName).toBe(orgName);
    expect(body.alreadySuppressed).toBe(false);
  });

  it('GET with expired token returns 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/notifications/unsubscribe?token=${token({ expiresAt: Date.now() - 1000 })}`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('GET with invalid token returns 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications/unsubscribe?token=invalid-token-here',
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST creates suppression row', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/notifications/unsubscribe?token=${token()}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);

    const row = await getDb()
      .selectFrom('notification_suppressions')
      .select(['reason'])
      .where('org_id', '=', orgId)
      .where('address', '=', email)
      .executeTakeFirst();
    expect(row).toBeTruthy();
    expect(row!.reason).toBe('unsubscribe');
  });

  it('POST is idempotent', async () => {
    const t = token();
    await app.inject({ method: 'POST', url: `/api/v1/notifications/unsubscribe?token=${t}` });
    const res2 = await app.inject({ method: 'POST', url: `/api/v1/notifications/unsubscribe?token=${t}` });
    expect(res2.statusCode).toBe(200);

    const count = await getDb()
      .selectFrom('notification_suppressions')
      .select(getDb().fn.countAll<number>().as('c'))
      .where('org_id', '=', orgId)
      .where('address', '=', email)
      .executeTakeFirst();
    expect(Number(count!.c)).toBe(1);
  });

  it('GET shows alreadySuppressed=true after unsubscribe', async () => {
    const t = token();
    await app.inject({ method: 'POST', url: `/api/v1/notifications/unsubscribe?token=${t}` });
    const res = await app.inject({ method: 'GET', url: `/api/v1/notifications/unsubscribe?token=${t}` });
    expect(res.json().alreadySuppressed).toBe(true);
  });

  it('POST resubscribe removes suppression', async () => {
    const t = token();
    await app.inject({ method: 'POST', url: `/api/v1/notifications/unsubscribe?token=${t}` });
    const res = await app.inject({ method: 'POST', url: `/api/v1/notifications/resubscribe?token=${t}` });
    expect(res.statusCode).toBe(200);

    const row = await getDb()
      .selectFrom('notification_suppressions')
      .select(['address'])
      .where('org_id', '=', orgId)
      .where('address', '=', email)
      .executeTakeFirst();
    expect(row).toBeFalsy();
  });

  it('cross-org: token for org A does not affect org B', async () => {
    const { orgId: orgB } = await createTestOrg('admin-b@example.com');
    const tA = token();
    await app.inject({ method: 'POST', url: `/api/v1/notifications/unsubscribe?token=${tA}` });

    const rowB = await getDb()
      .selectFrom('notification_suppressions')
      .select(['address'])
      .where('org_id', '=', orgB)
      .where('address', '=', email)
      .executeTakeFirst();
    expect(rowB).toBeFalsy();
  });
});
