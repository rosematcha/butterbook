-- Promo codes for public membership checkout.

-- Up Migration
SET search_path TO public, extensions;

CREATE TABLE promo_codes (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                     UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  code                       TEXT NOT NULL,
  description                TEXT,
  discount_type              TEXT NOT NULL CHECK (discount_type IN ('percent', 'amount')),
  discount_percent           INT CHECK (discount_percent IS NULL OR (discount_percent >= 1 AND discount_percent <= 100)),
  discount_amount_cents      INT CHECK (discount_amount_cents IS NULL OR discount_amount_cents > 0),
  membership_tier_id         UUID REFERENCES membership_tiers(id) ON DELETE SET NULL,
  starts_at                  TIMESTAMPTZ,
  expires_at                 TIMESTAMPTZ,
  max_redemptions            INT CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redeemed_count             INT NOT NULL DEFAULT 0 CHECK (redeemed_count >= 0),
  active                     BOOLEAN NOT NULL DEFAULT true,
  deleted_at                 TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT promo_codes_discount_shape CHECK (
    (discount_type = 'percent' AND discount_percent IS NOT NULL AND discount_amount_cents IS NULL)
    OR
    (discount_type = 'amount' AND discount_amount_cents IS NOT NULL AND discount_percent IS NULL)
  ),
  CONSTRAINT promo_codes_expiry_order CHECK (starts_at IS NULL OR expires_at IS NULL OR starts_at < expires_at)
);

CREATE UNIQUE INDEX idx_promo_codes_org_code_active ON promo_codes(org_id, lower(code)) WHERE deleted_at IS NULL;
CREATE INDEX idx_promo_codes_org_active ON promo_codes(org_id, active, code) WHERE deleted_at IS NULL;
CREATE INDEX idx_promo_codes_tier ON promo_codes(membership_tier_id) WHERE membership_tier_id IS NOT NULL;
CREATE TRIGGER promo_codes_updated_at BEFORE UPDATE ON promo_codes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes FORCE ROW LEVEL SECURITY;
CREATE POLICY p_tenant ON promo_codes USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());

-- Down Migration
DROP TABLE IF EXISTS promo_codes CASCADE;
