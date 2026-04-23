import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, createUser, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { getDb } from '../../src/db/index.js';
import { randomTokenBase64Url } from '../../src/utils/ids.js';

// Verifies the one-org-per-user constraint at the invitation boundary:
//   - creating an invitation for an email that already has a membership → 409
//   - accepting an invitation while already in any org → 409
describe('invitations · one-org-per-user', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await makeApp(); });
  afterAll(async () => { await app.close(); });
  beforeEach(async () => { await truncateAll(); });

  it('rejects POST /invitations when the invitee already belongs to an org', async () => {
    // Two separate orgs with their own owners.
    const { orgId: orgA } = await createTestOrg('owner-a@example.com');
    await createTestOrg('owner-b@example.com');
    const tokenA = await loginToken(app, 'owner-a@example.com');

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgA}/invitations`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { email: 'owner-b@example.com', roleIds: [] },
    });
    expect(res.statusCode).toBe(409);
  });

  it('rejects accept when the accepting user already belongs to an org', async () => {
    const { orgId: orgA } = await createTestOrg('owner-a@example.com');
    // Create a separate user (no org yet), then plant them in another org.
    const { orgId: orgB, userId: userB } = await createTestOrg('owner-b@example.com');
    void orgB;

    // Manually craft an invitation for userB's email into orgA, bypassing the
    // creation-side guard (we're testing the accept-side guard).
    const { token, hash } = randomTokenBase64Url(32);
    await getDb().insertInto('invitations').values({
      org_id: orgA,
      email: 'owner-b@example.com',
      token_hash: hash,
      invited_by: userB,
      role_ids: [],
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
    }).execute();

    const tokenB = await loginToken(app, 'owner-b@example.com');
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/invitations/${token}/accept`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    expect(res.statusCode).toBe(409);
  });

  it('allows a brand-new user to accept and join an org', async () => {
    const { orgId, userId: ownerId } = await createTestOrg('owner@example.com');
    void ownerId;

    const { token, hash } = randomTokenBase64Url(32);
    await getDb().insertInto('invitations').values({
      org_id: orgId,
      email: 'newbie@example.com',
      token_hash: hash,
      invited_by: ownerId,
      role_ids: [],
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
    }).execute();

    // No prior user account; supply registration body.
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/invitations/${token}/accept`,
      payload: { email: 'newbie@example.com', password: 'longenoughpass1234' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects accept when the signed-in account email does not match the invitation', async () => {
    const { orgId, userId: ownerId } = await createTestOrg('owner@example.com');
    const intruderId = await createUser('intruder@example.com');
    void intruderId;

    const { token, hash } = randomTokenBase64Url(32);
    await getDb().insertInto('invitations').values({
      org_id: orgId,
      email: 'invitee@example.com',
      token_hash: hash,
      invited_by: ownerId,
      role_ids: [],
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
    }).execute();

    const intruderToken = await loginToken(app, 'intruder@example.com');
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/invitations/${token}/accept`,
      headers: { authorization: `Bearer ${intruderToken}` },
    });
    expect(res.statusCode).toBe(409);
  });
});
