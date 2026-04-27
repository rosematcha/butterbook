import { describe, it, expect } from 'vitest';
import {
  PLAN_SLUGS,
  PLAN_FEATURES,
  PLANS,
  getPlan,
  planHasFeature,
  comparePlans,
  minimumPlanFor,
} from './registry.js';
import type { PlanSlug, PlanFeature } from './registry.js';

describe('plan registry', () => {
  it('every slug has a definition', () => {
    for (const slug of PLAN_SLUGS) {
      const plan = getPlan(slug);
      expect(plan).toBeDefined();
      expect(plan.slug).toBe(slug);
    }
  });

  it('caps match the pricing table', () => {
    expect(PLANS.free.appointmentsPerMonth).toBe(200);
    expect(PLANS.free.eventsPerMonth).toBe(4);
    expect(PLANS.free.monthlyPriceCents).toBe(0);

    expect(PLANS.starter.appointmentsPerMonth).toBe(1_500);
    expect(PLANS.starter.eventsPerMonth).toBe(15);
    expect(PLANS.starter.monthlyPriceCents).toBe(800);

    expect(PLANS.growth.appointmentsPerMonth).toBe(6_000);
    expect(PLANS.growth.eventsPerMonth).toBe(50);
    expect(PLANS.growth.monthlyPriceCents).toBe(1_800);

    expect(PLANS.professional.appointmentsPerMonth).toBe(25_000);
    expect(PLANS.professional.eventsPerMonth).toBe(150);
    expect(PLANS.professional.monthlyPriceCents).toBe(3_600);
  });

  describe('planHasFeature', () => {
    it('professional has memberships', () => {
      expect(planHasFeature('professional', 'memberships')).toBe(true);
    });

    it('free does not have custom_branding', () => {
      expect(planHasFeature('free', 'custom_branding')).toBe(false);
    });

    it('free has no features', () => {
      for (const feature of PLAN_FEATURES) {
        expect(planHasFeature('free', feature)).toBe(false);
      }
    });

    it('starter has custom_form_fields and custom_branding', () => {
      expect(planHasFeature('starter', 'custom_form_fields')).toBe(true);
      expect(planHasFeature('starter', 'custom_branding')).toBe(true);
    });

    it('starter does not have growth-tier features', () => {
      expect(planHasFeature('starter', 'email_verification')).toBe(false);
      expect(planHasFeature('starter', 'event_ticket_payments')).toBe(false);
    });

    it('growth has email_verification and event_ticket_payments', () => {
      expect(planHasFeature('growth', 'email_verification')).toBe(true);
      expect(planHasFeature('growth', 'event_ticket_payments')).toBe(true);
    });

    it('growth does not have professional-tier features', () => {
      expect(planHasFeature('growth', 'memberships')).toBe(false);
      expect(planHasFeature('growth', 'promo_codes')).toBe(false);
      expect(planHasFeature('growth', 'member_only_events')).toBe(false);
    });

    it('professional has all features', () => {
      for (const feature of PLAN_FEATURES) {
        expect(planHasFeature('professional', feature)).toBe(true);
      }
    });
  });

  describe('comparePlans', () => {
    it('free < professional', () => {
      expect(comparePlans('free', 'professional')).toBe(-1);
    });

    it('professional > free', () => {
      expect(comparePlans('professional', 'free')).toBe(1);
    });

    it('same plan returns 0', () => {
      for (const slug of PLAN_SLUGS) {
        expect(comparePlans(slug, slug)).toBe(0);
      }
    });

    it('ordering is free < starter < growth < professional', () => {
      expect(comparePlans('free', 'starter')).toBe(-1);
      expect(comparePlans('starter', 'growth')).toBe(-1);
      expect(comparePlans('growth', 'professional')).toBe(-1);
    });
  });

  describe('minimumPlanFor', () => {
    it('custom_branding requires starter', () => {
      expect(minimumPlanFor('custom_branding')).toBe('starter');
    });

    it('email_verification requires growth', () => {
      expect(minimumPlanFor('email_verification')).toBe('growth');
    });

    it('memberships requires professional', () => {
      expect(minimumPlanFor('memberships')).toBe('professional');
    });
  });

  describe('stripePriceIdEnvVar', () => {
    it('free has no stripe price env var', () => {
      expect(PLANS.free.stripePriceIdEnvVar).toBeNull();
    });

    it('paid plans have stripe price env vars', () => {
      expect(PLANS.starter.stripePriceIdEnvVar).toBe('STRIPE_PRICE_STARTER_MONTHLY');
      expect(PLANS.growth.stripePriceIdEnvVar).toBe('STRIPE_PRICE_GROWTH_MONTHLY');
      expect(PLANS.professional.stripePriceIdEnvVar).toBe('STRIPE_PRICE_PROFESSIONAL_MONTHLY');
    });
  });
});
