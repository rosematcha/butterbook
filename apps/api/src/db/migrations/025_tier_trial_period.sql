-- Add trial_period_days to membership_tiers for Stripe subscription trials.

-- Up Migration
ALTER TABLE membership_tiers
  ADD COLUMN trial_period_days INT NOT NULL DEFAULT 0
  CHECK (trial_period_days >= 0 AND trial_period_days <= 365);

-- Down Migration
ALTER TABLE membership_tiers DROP COLUMN IF EXISTS trial_period_days;
