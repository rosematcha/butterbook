import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { enableBillingGating, setOrgPlan } from '../helpers/plan.js';
import { getDb } from '../../src/db/index.js';

describe('plan feature gating', () => {
  let app: FastifyInstance;
  let orgId: string;
  let locationId: string;
  let ownerToken: string;
  let cleanupBilling: () => void;

  beforeAll(async () => {
    app = await makeApp();
    cleanupBilling = enableBillingGating();
  });

  afterAll(async () => {
    cleanupBilling();
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll();
    const r = await createTestOrg();
    orgId = r.orgId;
    locationId = r.locationId;
    ownerToken = await loginToken(app, 'owner@example.com');
  });

  describe('Free org gets 402', () => {
    beforeEach(async () => {
      await setOrgPlan(orgId, 'free');
    });

    it('PATCH branding returns 402', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/orgs/${orgId}/branding`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { theme: { primaryColor: '#ff0000' } },
      });
      expect(res.statusCode).toBe(402);
      const body = JSON.parse(res.body);
      expect(body.type).toBe('https://butterbook.app/errors/plan-feature-locked');
      expect(body.feature).toBe('custom_branding');
      expect(body.requiredPlan).toBe('starter');
    });

    it('PUT form fields returns 402', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/orgs/${orgId}/form`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { fields: [{ fieldKey: 'name', label: 'Name', fieldType: 'text', required: true, isSystem: true, displayOrder: 0 }] },
      });
      expect(res.statusCode).toBe(402);
      const body = JSON.parse(res.body);
      expect(body.feature).toBe('custom_form_fields');
    });

    it('POST promo-codes returns 402', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/orgs/${orgId}/promo-codes`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          code: 'TEST10',
          discountType: 'percent',
          discountPercent: 10,
        },
      });
      expect(res.statusCode).toBe(402);
      const body = JSON.parse(res.body);
      expect(body.feature).toBe('promo_codes');
    });

    it('PATCH membership-policies returns 402', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/orgs/${orgId}/membership-policies`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { enabled: true },
      });
      expect(res.statusCode).toBe(402);
      const body = JSON.parse(res.body);
      expect(body.feature).toBe('memberships');
    });
  });

  describe('Professional org succeeds', () => {
    beforeEach(async () => {
      await setOrgPlan(orgId, 'professional');
    });

    it('PATCH branding returns 200', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/orgs/${orgId}/branding`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { theme: { primaryColor: '#ff0000' } },
      });
      expect(res.statusCode).toBe(200);
    });

    it('PUT form fields returns 200', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/api/v1/orgs/${orgId}/form`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { fields: [{ fieldKey: 'name', label: 'Name', fieldType: 'text', required: true, isSystem: true, displayOrder: 0 }] },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('grandfathered org bypasses gating', () => {
    it('grandfathered Free org can edit branding', async () => {
      await getDb()
        .updateTable('orgs')
        .set({
          plan: 'free',
          plan_grandfathered_until: new Date(Date.now() + 86_400_000),
        })
        .where('id', '=', orgId)
        .execute();

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/orgs/${orgId}/branding`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { theme: { primaryColor: '#ff0000' } },
      });
      expect(res.statusCode).toBe(200);
    });
  });
});
