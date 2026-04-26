-- API keys for org-scoped integrations.
-- Also extend audit_log actor_type to include 'api_key'.

ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_actor_type_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_actor_type_check CHECK (actor_type IN ('user','guest','kiosk','system','api_key'));

CREATE TABLE org_api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES orgs(id),
  prefix        TEXT NOT NULL,
  key_hash      TEXT NOT NULL,
  name          TEXT NOT NULL,
  permissions   TEXT[] NOT NULL DEFAULT '{}',
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX idx_org_api_keys_org ON org_api_keys (org_id);
CREATE UNIQUE INDEX idx_org_api_keys_prefix ON org_api_keys (prefix);
CREATE INDEX idx_org_api_keys_hash ON org_api_keys (key_hash) WHERE revoked_at IS NULL;

ALTER TABLE org_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_tenant ON org_api_keys USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());
