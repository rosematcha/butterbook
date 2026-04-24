-- Membership core: policies, tiers, manual memberships, payments, guest passes,
-- and member-only event gates.

-- Up Migration
SET search_path TO public, extensions;

CREATE TABLE org_membership_policies (
  org_id                 UUID PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  enabled                BOOLEAN NOT NULL DEFAULT false,
  grace_period_days      INT NOT NULL DEFAULT 14 CHECK (grace_period_days >= 0 AND grace_period_days <= 365),
  renewal_reminder_days  INT[] NOT NULL DEFAULT '{30,7}',
  self_cancel_enabled    BOOLEAN NOT NULL DEFAULT true,
  self_update_enabled    BOOLEAN NOT NULL DEFAULT true,
  public_page_enabled    BOOLEAN NOT NULL DEFAULT true,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER org_membership_policies_updated_at BEFORE UPDATE ON org_membership_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE membership_tiers (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                     UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  slug                       TEXT NOT NULL,
  name                       TEXT NOT NULL,
  description                TEXT,
  price_cents                INT NOT NULL CHECK (price_cents >= 0),
  billing_interval           TEXT NOT NULL CHECK (billing_interval IN ('year', 'month', 'lifetime', 'one_time')),
  duration_days              INT CHECK (duration_days IS NULL OR duration_days > 0),
  guest_passes_included      INT NOT NULL DEFAULT 0 CHECK (guest_passes_included >= 0),
  member_only_event_access   BOOLEAN NOT NULL DEFAULT true,
  stripe_price_id            TEXT,
  max_active                 INT CHECK (max_active IS NULL OR max_active > 0),
  sort_order                 INT NOT NULL DEFAULT 0,
  active                     BOOLEAN NOT NULL DEFAULT true,
  deleted_at                 TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);
CREATE INDEX idx_membership_tiers_org_sort ON membership_tiers(org_id, sort_order, name) WHERE deleted_at IS NULL;
CREATE TRIGGER membership_tiers_updated_at BEFORE UPDATE ON membership_tiers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE memberships (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                     UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  visitor_id                 UUID NOT NULL REFERENCES visitors(id) ON DELETE RESTRICT,
  tier_id                    UUID NOT NULL REFERENCES membership_tiers(id) ON DELETE RESTRICT,
  status                     TEXT NOT NULL CHECK (status IN ('pending', 'active', 'expired', 'lapsed', 'cancelled', 'refunded')),
  started_at                 TIMESTAMPTZ,
  expires_at                 TIMESTAMPTZ,
  auto_renew                 BOOLEAN NOT NULL DEFAULT false,
  stripe_subscription_id     TEXT,
  stripe_latest_invoice_id   TEXT,
  cancelled_at               TIMESTAMPTZ,
  cancelled_reason           TEXT,
  metadata                   JSONB NOT NULL DEFAULT '{}',
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_memberships_org_visitor_status ON memberships(org_id, visitor_id, status);
CREATE INDEX idx_memberships_org_expires_active ON memberships(org_id, expires_at) WHERE status = 'active';
CREATE INDEX idx_memberships_org_tier ON memberships(org_id, tier_id);
CREATE TRIGGER memberships_updated_at BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE membership_payments (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id            UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  org_id                   UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  amount_cents             INT NOT NULL CHECK (amount_cents >= 0),
  currency                 CHAR(3) NOT NULL DEFAULT 'usd',
  source                   TEXT NOT NULL CHECK (source IN ('manual', 'stripe')),
  stripe_charge_id         TEXT,
  stripe_invoice_id        TEXT,
  paid_at                  TIMESTAMPTZ,
  refunded_at              TIMESTAMPTZ,
  refunded_amount_cents    INT CHECK (refunded_amount_cents IS NULL OR refunded_amount_cents >= 0),
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_membership_payments_membership ON membership_payments(membership_id);
CREATE INDEX idx_membership_payments_org_paid ON membership_payments(org_id, paid_at DESC);

CREATE TABLE guest_passes (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id          UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  org_id                 UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  code                   TEXT NOT NULL UNIQUE,
  qr_token               UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  issued_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at             TIMESTAMPTZ,
  redeemed_at            TIMESTAMPTZ,
  redeemed_by_visit_id   UUID REFERENCES visits(id) ON DELETE SET NULL
);
CREATE INDEX idx_guest_passes_org_code ON guest_passes(org_id, code);
CREATE INDEX idx_guest_passes_membership ON guest_passes(membership_id);

ALTER TABLE events ADD COLUMN membership_required_tier_id UUID REFERENCES membership_tiers(id) ON DELETE SET NULL;
CREATE INDEX idx_events_membership_required_tier ON events(membership_required_tier_id) WHERE membership_required_tier_id IS NOT NULL;

ALTER TABLE org_membership_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_membership_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE membership_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_tiers FORCE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE membership_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_payments FORCE ROW LEVEL SECURITY;
ALTER TABLE guest_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_passes FORCE ROW LEVEL SECURITY;

CREATE POLICY p_tenant ON org_membership_policies USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());
CREATE POLICY p_tenant ON membership_tiers USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());
CREATE POLICY p_tenant ON memberships USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());
CREATE POLICY p_tenant ON membership_payments USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());
CREATE POLICY p_tenant ON guest_passes USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());

INSERT INTO org_membership_policies (org_id)
SELECT id FROM orgs
ON CONFLICT (org_id) DO NOTHING;

INSERT INTO notification_templates (org_id, template_key, subject, body_html, body_text)
SELECT o.id, v.template_key, v.subject, v.body_html, v.body_text
FROM orgs o
CROSS JOIN (VALUES
  (
    'membership.welcome',
    'Your {{tierName}} membership is active',
    '<p>Hi {{visitorName}},</p><p>Your {{tierName}} membership at {{orgName}} is active.</p>{{#if expiresAt}}<p>Membership expires {{expiresAt}}.</p>{{/if}}',
    'Hi {{visitorName}},' || chr(10) || chr(10) || 'Your {{tierName}} membership at {{orgName}} is active.' || chr(10) || chr(10) || '{{#if expiresAt}}Membership expires {{expiresAt}}.{{/if}}'
  ),
  (
    'membership.renewal_reminder',
    'Your {{orgName}} membership renews soon',
    '<p>Hi {{visitorName}},</p><p>Your {{tierName}} membership expires soon.</p>',
    'Hi {{visitorName}},' || chr(10) || chr(10) || 'Your {{tierName}} membership expires soon.'
  ),
  (
    'membership.expired',
    'Your {{orgName}} membership has expired',
    '<p>Hi {{visitorName}},</p><p>Your {{tierName}} membership has expired.</p>',
    'Hi {{visitorName}},' || chr(10) || chr(10) || 'Your {{tierName}} membership has expired.'
  ),
  (
    'membership.lapsed',
    'Your {{orgName}} membership has lapsed',
    '<p>Hi {{visitorName}},</p><p>Your {{tierName}} membership has lapsed.</p>',
    'Hi {{visitorName}},' || chr(10) || chr(10) || 'Your {{tierName}} membership has lapsed.'
  ),
  (
    'membership.cancelled',
    'Your {{orgName}} membership was cancelled',
    '<p>Hi {{visitorName}},</p><p>Your {{tierName}} membership was cancelled.</p>',
    'Hi {{visitorName}},' || chr(10) || chr(10) || 'Your {{tierName}} membership was cancelled.'
  ),
  (
    'membership.payment_failed',
    'Membership payment failed',
    '<p>Hi {{visitorName}},</p><p>We could not process payment for your {{tierName}} membership.</p>',
    'Hi {{visitorName}},' || chr(10) || chr(10) || 'We could not process payment for your {{tierName}} membership.'
  ),
  (
    'broadcast.generic',
    '{{subject}}',
    '{{{bodyHtml}}}',
    '{{bodyText}}'
  )
) AS v(template_key, subject, body_html, body_text)
ON CONFLICT (org_id, template_key) DO NOTHING;

-- Down Migration
ALTER TABLE events DROP COLUMN IF EXISTS membership_required_tier_id;
DROP TABLE IF EXISTS guest_passes CASCADE;
DROP TABLE IF EXISTS membership_payments CASCADE;
DROP TABLE IF EXISTS memberships CASCADE;
DROP TABLE IF EXISTS membership_tiers CASCADE;
DROP TABLE IF EXISTS org_membership_policies CASCADE;
