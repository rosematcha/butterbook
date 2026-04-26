-- SSO providers for org-level Google/Microsoft OIDC.

CREATE TABLE org_sso_providers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES orgs(id),
  provider         TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
  client_id        TEXT NOT NULL,
  client_secret    BYTEA NOT NULL,
  allowed_domains  TEXT[] NOT NULL DEFAULT '{}',
  default_role_id  UUID REFERENCES roles(id),
  sso_required     BOOLEAN NOT NULL DEFAULT false,
  enabled          BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, provider)
);

CREATE INDEX idx_org_sso_providers_org ON org_sso_providers (org_id);

ALTER TABLE org_sso_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_tenant ON org_sso_providers USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());
