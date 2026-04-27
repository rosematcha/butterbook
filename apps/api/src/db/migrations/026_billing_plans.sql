-- Persist plan state per org: plan enum, subscription tracking, usage counters.

-- Up Migration

CREATE TYPE plan_slug AS ENUM ('free', 'starter', 'growth', 'professional');
CREATE TYPE plan_status AS ENUM ('active', 'past_due', 'cancelled', 'incomplete');

ALTER TABLE orgs
  ADD COLUMN plan plan_slug NOT NULL DEFAULT 'free',
  ADD COLUMN plan_status plan_status NOT NULL DEFAULT 'active',
  ADD COLUMN plan_grandfathered_until TIMESTAMPTZ NULL;

CREATE TABLE org_subscriptions (
  org_id UUID PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NULL UNIQUE,
  stripe_subscription_id TEXT NULL UNIQUE,
  current_plan plan_slug NOT NULL DEFAULT 'free',
  current_period_start TIMESTAMPTZ NULL,
  current_period_end TIMESTAMPTZ NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  last_invoice_status TEXT NULL,
  last_synced_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE org_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_subscriptions_tenant ON org_subscriptions
  USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());

CREATE TABLE org_usage_periods (
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  period_yyyymm INT NOT NULL,
  appointments_count INT NOT NULL DEFAULT 0,
  events_count INT NOT NULL DEFAULT 0,
  cap_warning_sent_at TIMESTAMPTZ NULL,
  cap_exceeded_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, period_yyyymm)
);

ALTER TABLE org_usage_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_usage_periods_tenant ON org_usage_periods
  USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());

CREATE INDEX idx_org_usage_periods_org_period ON org_usage_periods(org_id, period_yyyymm);

-- Backfill existing orgs to professional (grandfathering — see §0.6).
UPDATE orgs SET plan = 'professional' WHERE created_at < now();

-- Down Migration

DROP INDEX IF EXISTS idx_org_usage_periods_org_period;
DROP TABLE IF EXISTS org_usage_periods;
DROP TABLE IF EXISTS org_subscriptions;
ALTER TABLE orgs
  DROP COLUMN IF EXISTS plan_grandfathered_until,
  DROP COLUMN IF EXISTS plan_status,
  DROP COLUMN IF EXISTS plan;
DROP TYPE IF EXISTS plan_status;
DROP TYPE IF EXISTS plan_slug;
