import { getDb } from '../../src/db/index.js';
import type { PlanSlugDb } from '../../src/db/types.js';
import { loadConfig, __resetConfigForTests } from '../../src/config.js';

/**
 * Sets an org's plan directly in the DB (for testing plan gating).
 */
export async function setOrgPlan(orgId: string, plan: PlanSlugDb): Promise<void> {
  await getDb()
    .updateTable('orgs')
    .set({ plan, plan_grandfathered_until: null })
    .where('id', '=', orgId)
    .execute();
}

/**
 * Enables billing gating for a test block. Call in beforeAll/beforeEach.
 * Returns a cleanup function to call in afterAll/afterEach.
 */
export function enableBillingGating(): () => void {
  process.env.BILLING_GATING_ENABLED = 'true';
  __resetConfigForTests();
  loadConfig();
  return () => {
    delete process.env.BILLING_GATING_ENABLED;
    __resetConfigForTests();
    loadConfig();
  };
}
