-- Museum Scheduler: initial schema
-- Implements SPEC.md §4 in full: tables, RLS, triggers, indexes.

-- Up Migration
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- Trigger fn: bump updated_at on UPDATE.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------------
-- orgs
-- --------------------------------------------------------------------------
CREATE TABLE orgs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  address               TEXT NOT NULL,
  zip                   TEXT NOT NULL,
  timezone              TEXT NOT NULL,
  public_slug           TEXT NOT NULL UNIQUE,
  slug_prefix           TEXT NOT NULL DEFAULT 'e',
  slot_rounding         TEXT NOT NULL DEFAULT 'freeform' CHECK (slot_rounding IN ('freeform','5','10','15','30')),
  kiosk_reset_seconds   INT NOT NULL DEFAULT 15 CHECK (kiosk_reset_seconds BETWEEN 3 AND 300),
  logo_url              TEXT,
  theme                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  form_fields           JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ
);
CREATE TRIGGER orgs_updated_at BEFORE UPDATE ON orgs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --------------------------------------------------------------------------
-- locations + hours
-- --------------------------------------------------------------------------
CREATE TABLE locations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  name         TEXT NOT NULL,
  address      TEXT,
  zip          TEXT,
  qr_token     UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  is_primary   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);
CREATE INDEX idx_locations_org ON locations(org_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_locations_one_primary_per_org
  ON locations(org_id) WHERE is_primary = true AND deleted_at IS NULL;
CREATE TRIGGER locations_updated_at BEFORE UPDATE ON locations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE location_hours (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id   UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  day_of_week   INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time     TIME NOT NULL,
  close_time    TIME NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (close_time > open_time)
);
CREATE INDEX idx_location_hours_location ON location_hours(location_id);
CREATE TRIGGER location_hours_updated_at BEFORE UPDATE ON location_hours FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE location_hour_overrides (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id   UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  date          DATE NOT NULL,
  open_time     TIME,
  close_time    TIME,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (open_time IS NULL AND close_time IS NULL) OR
    (open_time IS NOT NULL AND close_time IS NOT NULL AND close_time > open_time)
  )
);
CREATE INDEX idx_hour_overrides_location_date ON location_hour_overrides(location_id, date);
CREATE TRIGGER lh_over_updated_at BEFORE UPDATE ON location_hour_overrides FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE closed_days (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id   UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  date          DATE NOT NULL,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (location_id, date)
);
CREATE TRIGGER closed_days_updated_at BEFORE UPDATE ON closed_days FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --------------------------------------------------------------------------
-- users + sessions
-- --------------------------------------------------------------------------
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           CITEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  totp_secret_enc BYTEA,
  totp_enabled    BOOLEAN NOT NULL DEFAULT false,
  display_name    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  last_used_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip            INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_sessions_expires ON sessions(expires_at) WHERE revoked_at IS NULL;

-- --------------------------------------------------------------------------
-- org_members, roles, role_permissions, member_roles
-- --------------------------------------------------------------------------
CREATE TABLE org_members (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  is_superadmin  BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,
  UNIQUE (org_id, user_id)
);
CREATE INDEX idx_org_members_org ON org_members(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_org_members_user ON org_members(user_id) WHERE deleted_at IS NULL;
CREATE TRIGGER org_members_updated_at BEFORE UPDATE ON org_members FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE roles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  name         TEXT NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,
  UNIQUE (org_id, name)
);
CREATE TRIGGER roles_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE role_permissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id      UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission   TEXT NOT NULL,
  scope_type   TEXT,
  scope_id     UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (role_id, permission, scope_type, scope_id)
);
CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);

CREATE TABLE member_roles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_member_id  UUID NOT NULL REFERENCES org_members(id) ON DELETE CASCADE,
  role_id        UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_member_id, role_id)
);
CREATE INDEX idx_member_roles_member ON member_roles(org_member_id);

-- --------------------------------------------------------------------------
-- events, visits, waitlist_entries, invitations, idempotency_keys, audit_log
-- --------------------------------------------------------------------------
CREATE TABLE events (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  location_id            UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  created_by             UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title                  TEXT NOT NULL,
  description            TEXT,
  slug                   TEXT,
  public_id              TEXT NOT NULL UNIQUE,
  starts_at              TIMESTAMPTZ NOT NULL,
  ends_at                TIMESTAMPTZ NOT NULL,
  capacity               INT CHECK (capacity IS NULL OR capacity > 0),
  waitlist_enabled       BOOLEAN NOT NULL DEFAULT false,
  waitlist_auto_promote  BOOLEAN NOT NULL DEFAULT false,
  form_fields            JSONB,
  is_published           BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at             TIMESTAMPTZ,
  CHECK (ends_at > starts_at)
);
CREATE INDEX idx_events_org ON events(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_events_location ON events(location_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_events_starts_at ON events(starts_at) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_events_slug_per_org ON events(org_id, slug) WHERE slug IS NOT NULL AND deleted_at IS NULL;
CREATE TRIGGER events_updated_at BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE visits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  location_id       UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  event_id          UUID REFERENCES events(id) ON DELETE RESTRICT,
  booked_by         UUID REFERENCES users(id) ON DELETE RESTRICT,
  booking_method    TEXT NOT NULL CHECK (booking_method IN ('self','admin','kiosk')),
  scheduled_at      TIMESTAMPTZ NOT NULL,
  form_response     JSONB NOT NULL,
  status            TEXT NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('confirmed','cancelled','no_show')),
  cancelled_at      TIMESTAMPTZ,
  cancelled_by      UUID REFERENCES users(id) ON DELETE RESTRICT,
  pii_redacted      BOOLEAN NOT NULL DEFAULT false,
  idempotency_key   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_visits_org_scheduled ON visits(org_id, scheduled_at);
CREATE INDEX idx_visits_location_scheduled ON visits(location_id, scheduled_at);
CREATE INDEX idx_visits_event ON visits(event_id) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX idx_visits_idempotency ON visits(org_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_visits_form_gin ON visits USING gin (form_response);
CREATE TRIGGER visits_updated_at BEFORE UPDATE ON visits FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE waitlist_entries (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  event_id           UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  form_response      JSONB NOT NULL,
  sort_order         DOUBLE PRECISION NOT NULL,
  status             TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','promoted','removed')),
  promoted_at        TIMESTAMPTZ,
  promoted_by        UUID REFERENCES users(id) ON DELETE RESTRICT,
  promoted_visit_id  UUID REFERENCES visits(id) ON DELETE RESTRICT,
  idempotency_key    TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_waitlist_event_order ON waitlist_entries(event_id, sort_order) WHERE status = 'waiting';
CREATE UNIQUE INDEX idx_waitlist_idempotency ON waitlist_entries(event_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE TRIGGER waitlist_updated_at BEFORE UPDATE ON waitlist_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE invitations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  email        CITEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  invited_by   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role_ids     UUID[] NOT NULL DEFAULT '{}',
  expires_at   TIMESTAMPTZ NOT NULL,
  accepted_at  TIMESTAMPTZ,
  accepted_by  UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_invitations_org ON invitations(org_id) WHERE accepted_at IS NULL;

CREATE TABLE idempotency_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key             TEXT NOT NULL,
  scope           TEXT NOT NULL,
  org_id          UUID REFERENCES orgs(id) ON DELETE RESTRICT,
  request_hash    TEXT NOT NULL,
  response_status INT NOT NULL,
  response_body   JSONB NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (key, scope)
);
CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);

CREATE TABLE audit_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID REFERENCES orgs(id) ON DELETE RESTRICT,
  actor_id       UUID REFERENCES users(id) ON DELETE RESTRICT,
  actor_type     TEXT NOT NULL CHECK (actor_type IN ('user','guest','kiosk','system')),
  action         TEXT NOT NULL,
  target_type    TEXT NOT NULL,
  target_id      UUID NOT NULL,
  diff           JSONB,
  ip_address     INET,
  user_agent     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_org_created ON audit_log(org_id, created_at DESC);
CREATE INDEX idx_audit_target ON audit_log(target_type, target_id);

CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

-- --------------------------------------------------------------------------
-- Row-Level Security
-- The application role must NOT have BYPASSRLS. Migrations and bootstrap run as app_admin.
-- The RLS predicate reads app.current_org_id set via set_config(... 'true') in each tx.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION current_org_id_or_null()
RETURNS UUID AS $$
DECLARE
  v TEXT;
BEGIN
  v := current_setting('app.current_org_id', true);
  IF v IS NULL OR v = '' THEN RETURN NULL; END IF;
  RETURN v::uuid;
END;
$$ LANGUAGE plpgsql STABLE;

-- Apply RLS to each tenant-scoped table.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'locations','location_hours','location_hour_overrides','closed_days',
    'org_members','roles','role_permissions','member_roles',
    'events','visits','waitlist_entries','invitations','idempotency_keys','audit_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Policies. When app.current_org_id is unset (NULL), pass through — the application
-- performs its own org_id filtering for those queries. When set (inside withOrgContext),
-- RLS strictly enforces isolation as a defense-in-depth backstop: a handler that
-- forgets its WHERE clause cannot leak across tenants.
CREATE POLICY p_tenant ON locations              USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());
CREATE POLICY p_tenant ON org_members            USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());
CREATE POLICY p_tenant ON roles                  USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());
CREATE POLICY p_tenant ON events                 USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());
CREATE POLICY p_tenant ON visits                 USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());
CREATE POLICY p_tenant ON waitlist_entries       USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());
CREATE POLICY p_tenant ON invitations            USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());
CREATE POLICY p_tenant ON idempotency_keys       USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null() OR org_id IS NULL);
CREATE POLICY p_tenant ON audit_log              USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null() OR org_id IS NULL);

-- Tables that reach org_id indirectly (via the FK to a parent) use a subquery.
CREATE POLICY p_tenant ON location_hours USING (
  current_org_id_or_null() IS NULL OR
  EXISTS (SELECT 1 FROM locations l WHERE l.id = location_id AND l.org_id = current_org_id_or_null())
);
CREATE POLICY p_tenant ON location_hour_overrides USING (
  current_org_id_or_null() IS NULL OR
  EXISTS (SELECT 1 FROM locations l WHERE l.id = location_id AND l.org_id = current_org_id_or_null())
);
CREATE POLICY p_tenant ON closed_days USING (
  current_org_id_or_null() IS NULL OR
  EXISTS (SELECT 1 FROM locations l WHERE l.id = location_id AND l.org_id = current_org_id_or_null())
);
CREATE POLICY p_tenant ON role_permissions USING (
  current_org_id_or_null() IS NULL OR
  EXISTS (SELECT 1 FROM roles r WHERE r.id = role_id AND r.org_id = current_org_id_or_null())
);
CREATE POLICY p_tenant ON member_roles USING (
  current_org_id_or_null() IS NULL OR
  EXISTS (SELECT 1 FROM org_members m WHERE m.id = org_member_id AND m.org_id = current_org_id_or_null())
);

-- Down Migration
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS idempotency_keys CASCADE;
DROP TABLE IF EXISTS invitations CASCADE;
DROP TABLE IF EXISTS waitlist_entries CASCADE;
DROP TABLE IF EXISTS visits CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS member_roles CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS org_members CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS closed_days CASCADE;
DROP TABLE IF EXISTS location_hour_overrides CASCADE;
DROP TABLE IF EXISTS location_hours CASCADE;
DROP TABLE IF EXISTS locations CASCADE;
DROP TABLE IF EXISTS orgs CASCADE;
DROP FUNCTION IF EXISTS current_org_id_or_null();
DROP FUNCTION IF EXISTS prevent_audit_mutation();
DROP FUNCTION IF EXISTS set_updated_at();
