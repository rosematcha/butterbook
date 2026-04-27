import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, createUser, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { getDb } from '../../src/db/index.js';
import { encryptSecret } from '../../src/utils/crypto.js';

describe('SSO policy and login enforcement', () => {
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

  it('GET /sso/policy returns ssoRequired=false for unknown email', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/sso/policy?email=nobody@example.com',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ ssoRequired: false, providers: [] });
  });

  it('GET /sso/policy returns ssoRequired=false for user with no SSO', async () => {
    await createTestOrg('admin@example.com');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/sso/policy?email=admin@example.com',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.ssoRequired).toBe(false);
  });

  it('GET /sso/policy returns ssoRequired=true when org has sso_required provider', async () => {
    const { orgId } = await createTestOrg('admin@sso.com');
    await getDb()
      .insertInto('org_sso_providers')
      .values({
        org_id: orgId,
        provider: 'google',
        client_id: 'cid',
        client_secret: encryptSecret('csec'),
        allowed_domains: [],
        sso_required: true,
        enabled: true,
      })
      .execute();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/sso/policy?email=admin@sso.com',
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.ssoRequired).toBe(true);
    expect(data.providers).toContain('google');
  });

  it('GET /sso/policy ignores disabled providers', async () => {
    const { orgId } = await createTestOrg('admin2@sso.com');
    await getDb()
      .insertInto('org_sso_providers')
      .values({
        org_id: orgId,
        provider: 'microsoft',
        client_id: 'cid',
        client_secret: encryptSecret('csec'),
        allowed_domains: [],
        sso_required: true,
        enabled: false,
      })
      .execute();
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/sso/policy?email=admin2@sso.com',
    });
    expect(res.json().data.ssoRequired).toBe(false);
    expect(res.json().data.providers).toEqual([]);
  });

  it('POST /auth/login returns 403 sso_required when org requires SSO', async () => {
    const { orgId } = await createTestOrg('ssouser@example.com');
    await getDb()
      .insertInto('org_sso_providers')
      .values({
        org_id: orgId,
        provider: 'google',
        client_id: 'cid',
        client_secret: encryptSecret('csec'),
        allowed_domains: [],
        sso_required: true,
        enabled: true,
      })
      .execute();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'ssouser@example.com', password: 'longenoughpass1234' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().type).toContain('sso_required');
  });

  it('POST /auth/login succeeds when SSO exists but sso_required=false', async () => {
    const { orgId } = await createTestOrg('optionaluser@example.com');
    await getDb()
      .insertInto('org_sso_providers')
      .values({
        org_id: orgId,
        provider: 'google',
        client_id: 'cid',
        client_secret: encryptSecret('csec'),
        allowed_domains: [],
        sso_required: false,
        enabled: true,
      })
      .execute();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'optionaluser@example.com', password: 'longenoughpass1234' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.token).toBeDefined();
  });
});
