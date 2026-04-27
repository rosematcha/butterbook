export const PLAN_SLUGS = ['free', 'starter', 'growth', 'professional'] as const;
export type PlanSlug = (typeof PLAN_SLUGS)[number];

export const PLAN_FEATURES = [
  'custom_form_fields',
  'custom_branding',
  'email_verification',
  'event_ticket_payments',
  'memberships',
  'promo_codes',
  'member_only_events',
  'priority_support',
] as const;
export type PlanFeature = (typeof PLAN_FEATURES)[number];

export interface PlanDefinition {
  slug: PlanSlug;
  name: string;
  monthlyPriceCents: number;
  appointmentsPerMonth: number;
  eventsPerMonth: number;
  features: ReadonlySet<PlanFeature>;
  stripePriceIdEnvVar: string | null;
}

const FREE_FEATURES: ReadonlySet<PlanFeature> = new Set([]);

const STARTER_FEATURES: ReadonlySet<PlanFeature> = new Set<PlanFeature>([
  'custom_form_fields',
  'custom_branding',
]);

const GROWTH_FEATURES: ReadonlySet<PlanFeature> = new Set<PlanFeature>([
  'custom_form_fields',
  'custom_branding',
  'email_verification',
  'event_ticket_payments',
]);

const PROFESSIONAL_FEATURES: ReadonlySet<PlanFeature> = new Set<PlanFeature>([
  'custom_form_fields',
  'custom_branding',
  'email_verification',
  'event_ticket_payments',
  'memberships',
  'promo_codes',
  'member_only_events',
  'priority_support',
]);

export const PLANS: Record<PlanSlug, PlanDefinition> = {
  free: {
    slug: 'free',
    name: 'Free',
    monthlyPriceCents: 0,
    appointmentsPerMonth: 200,
    eventsPerMonth: 4,
    features: FREE_FEATURES,
    stripePriceIdEnvVar: null,
  },
  starter: {
    slug: 'starter',
    name: 'Starter',
    monthlyPriceCents: 800,
    appointmentsPerMonth: 1_500,
    eventsPerMonth: 15,
    features: STARTER_FEATURES,
    stripePriceIdEnvVar: 'STRIPE_PRICE_STARTER_MONTHLY',
  },
  growth: {
    slug: 'growth',
    name: 'Growth',
    monthlyPriceCents: 1_800,
    appointmentsPerMonth: 6_000,
    eventsPerMonth: 50,
    features: GROWTH_FEATURES,
    stripePriceIdEnvVar: 'STRIPE_PRICE_GROWTH_MONTHLY',
  },
  professional: {
    slug: 'professional',
    name: 'Professional',
    monthlyPriceCents: 3_600,
    appointmentsPerMonth: 25_000,
    eventsPerMonth: 150,
    features: PROFESSIONAL_FEATURES,
    stripePriceIdEnvVar: 'STRIPE_PRICE_PROFESSIONAL_MONTHLY',
  },
};

const PLAN_ORDER: Record<PlanSlug, number> = {
  free: 0,
  starter: 1,
  growth: 2,
  professional: 3,
};

export function getPlan(slug: PlanSlug): PlanDefinition {
  return PLANS[slug];
}

export function planHasFeature(slug: PlanSlug, feature: PlanFeature): boolean {
  return PLANS[slug].features.has(feature);
}

export function comparePlans(a: PlanSlug, b: PlanSlug): -1 | 0 | 1 {
  const diff = PLAN_ORDER[a] - PLAN_ORDER[b];
  if (diff < 0) return -1;
  if (diff > 0) return 1;
  return 0;
}

/**
 * Returns the minimum plan slug that includes the given feature,
 * or null if no plan includes it.
 */
export function minimumPlanFor(feature: PlanFeature): PlanSlug | null {
  for (const slug of PLAN_SLUGS) {
    if (PLANS[slug].features.has(feature)) return slug;
  }
  return null;
}
