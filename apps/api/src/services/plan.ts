import type { PlanSlug, PlanFeature } from '@butterbook/shared';
import { planHasFeature, minimumPlanFor } from '@butterbook/shared';
import type { Tx } from '../db/index.js';
import type { PlanSlugDb, PlanStatusDb } from '../db/types.js';
import { getConfig } from '../config.js';
import { PlanFeatureLockedError } from '../errors/index.js';

export interface OrgPlanInfo {
  plan: PlanSlug;
  status: PlanStatusDb;
  effectivePlan: PlanSlug;
  grandfatheredUntil: Date | null;
}

/**
 * Reads the org's plan info and computes the effective plan after
 * applying demo-mode, self-host bypass, and grandfathering overrides.
 */
export async function getOrgPlan(tx: Tx, orgId: string): Promise<OrgPlanInfo> {
  const row = await tx
    .selectFrom('orgs')
    .select(['plan', 'plan_status', 'plan_grandfathered_until', 'is_demo'])
    .where('id', '=', orgId)
    .executeTakeFirstOrThrow();

  const plan = row.plan as PlanSlug;
  const status = row.plan_status;
  const grandfatheredUntil = row.plan_grandfathered_until ?? null;

  const effectivePlan = resolveEffectivePlan(plan, {
    isDemo: row.is_demo,
    grandfatheredUntil,
  });

  return { plan, status, effectivePlan, grandfatheredUntil };
}

/**
 * Throws PlanFeatureLockedError if the org's effective plan does not
 * include the given feature. Call inside withOrgContext after requirePermission.
 */
export async function requireFeature(
  tx: Tx,
  orgId: string,
  feature: PlanFeature,
): Promise<void> {
  const { effectivePlan } = await getOrgPlan(tx, orgId);
  if (!planHasFeature(effectivePlan, feature)) {
    const required = minimumPlanFor(feature) ?? 'professional';
    throw new PlanFeatureLockedError(feature, effectivePlan, required);
  }
}

/**
 * Returns true if the org's effective plan includes the given feature.
 */
export async function isFeatureAvailable(
  tx: Tx,
  orgId: string,
  feature: PlanFeature,
): Promise<boolean> {
  const { effectivePlan } = await getOrgPlan(tx, orgId);
  return planHasFeature(effectivePlan, feature);
}

/**
 * Pure computation of the effective plan given context flags.
 */
export function resolveEffectivePlan(
  plan: PlanSlug,
  ctx: { isDemo: boolean; grandfatheredUntil: Date | null },
): PlanSlug {
  const config = getConfig();

  // Self-host bypass: billing gating disabled → everything is professional.
  if (!config.BILLING_GATING_ENABLED) {
    return 'professional';
  }

  // Demo orgs always get professional.
  if (ctx.isDemo) return 'professional';

  // Grandfathered orgs keep professional until expiry.
  if (ctx.grandfatheredUntil && ctx.grandfatheredUntil > new Date()) {
    return 'professional';
  }

  return plan;
}
