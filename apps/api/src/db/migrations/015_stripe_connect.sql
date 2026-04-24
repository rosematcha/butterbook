-- Stripe Connect account storage and webhook idempotency.

-- Up Migration
SET search_path TO public, extensions;

CREATE TABLE org_stripe_accounts (
  org_id              UUID PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  stripe_account_id   TEXT NOT NULL UNIQUE,
  charges_enabled     BOOLEAN NOT NULL DEFAULT false,
  payouts_enabled     BOOLEAN NOT NULL DEFAULT false,
  default_currency    CHAR(3) NOT NULL DEFAULT 'usd',
  webhook_secret      BYTEA,
  connected_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  disconnected_at     TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_org_stripe_accounts_connected ON org_stripe_accounts(org_id) WHERE disconnected_at IS NULL;
CREATE TRIGGER org_stripe_accounts_updated_at BEFORE UPDATE ON org_stripe_accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE stripe_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  stripe_event_id     TEXT NOT NULL UNIQUE,
  event_type          TEXT NOT NULL,
  payload             JSONB NOT NULL,
  processed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_stripe_events_org_created ON stripe_events(org_id, created_at DESC);

ALTER TABLE org_stripe_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_stripe_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_events FORCE ROW LEVEL SECURITY;

CREATE POLICY p_tenant ON org_stripe_accounts USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());
CREATE POLICY p_tenant ON stripe_events USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());

-- Down Migration
DROP TABLE IF EXISTS stripe_events CASCADE;
DROP TABLE IF EXISTS org_stripe_accounts CASCADE;
