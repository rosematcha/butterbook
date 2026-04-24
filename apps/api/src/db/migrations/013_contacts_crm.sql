-- Contacts CRM foundation: canonical visitors, visitor links, and saved segments.

-- Up Migration
SET search_path TO public, extensions;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE visitors (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  email              CITEXT NOT NULL,
  first_name         TEXT,
  last_name          TEXT,
  phone              TEXT,
  address            JSONB,
  tags               TEXT[] NOT NULL DEFAULT '{}',
  notes              TEXT,
  stripe_customer_id TEXT,
  pii_redacted       BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_visitors_org_email_active ON visitors(org_id, email) WHERE deleted_at IS NULL;
CREATE INDEX idx_visitors_org_created ON visitors(org_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_visitors_tags ON visitors USING gin (tags);
CREATE TRIGGER visitors_updated_at BEFORE UPDATE ON visitors FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE visits ADD COLUMN visitor_id UUID REFERENCES visitors(id) ON DELETE SET NULL;
ALTER TABLE waitlist_entries ADD COLUMN visitor_id UUID REFERENCES visitors(id) ON DELETE SET NULL;
CREATE INDEX idx_visits_visitor ON visits(visitor_id) WHERE visitor_id IS NOT NULL;
CREATE INDEX idx_waitlist_visitor ON waitlist_entries(visitor_id) WHERE visitor_id IS NOT NULL;

CREATE TABLE visitor_segments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  name               TEXT NOT NULL,
  filter             JSONB NOT NULL,
  visitor_count      INT,
  last_computed_at   TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ,
  UNIQUE (org_id, name)
);
CREATE INDEX idx_visitor_segments_org ON visitor_segments(org_id) WHERE deleted_at IS NULL;
CREATE TRIGGER visitor_segments_updated_at BEFORE UPDATE ON visitor_segments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitors FORCE ROW LEVEL SECURITY;
ALTER TABLE visitor_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitor_segments FORCE ROW LEVEL SECURITY;
CREATE POLICY p_tenant ON visitors USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());
CREATE POLICY p_tenant ON visitor_segments USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());

-- Backfill from existing visit and waitlist form_response JSON. The original
-- form_response is intentionally left untouched.
WITH extracted AS (
  SELECT
    org_id,
    lower(nullif(trim(coalesce(
      form_response->>'email',
      form_response->>'contact.email',
      form_response->>'contact_email'
    )), '')) AS email,
    nullif(trim(coalesce(
      form_response->>'name',
      form_response->>'full_name',
      form_response->>'contact.full_name'
    )), '') AS full_name,
    nullif(trim(coalesce(
      form_response->>'first_name',
      form_response->>'contact.first_name'
    )), '') AS first_name,
    nullif(trim(coalesce(
      form_response->>'last_name',
      form_response->>'contact.last_name'
    )), '') AS last_name,
    nullif(trim(coalesce(
      form_response->>'phone',
      form_response->>'contact.phone'
    )), '') AS phone
  FROM visits
  UNION ALL
  SELECT
    org_id,
    lower(nullif(trim(coalesce(
      form_response->>'email',
      form_response->>'contact.email',
      form_response->>'contact_email'
    )), '')) AS email,
    nullif(trim(coalesce(
      form_response->>'name',
      form_response->>'full_name',
      form_response->>'contact.full_name'
    )), '') AS full_name,
    nullif(trim(coalesce(
      form_response->>'first_name',
      form_response->>'contact.first_name'
    )), '') AS first_name,
    nullif(trim(coalesce(
      form_response->>'last_name',
      form_response->>'contact.last_name'
    )), '') AS last_name,
    nullif(trim(coalesce(
      form_response->>'phone',
      form_response->>'contact.phone'
    )), '') AS phone
  FROM waitlist_entries
),
normalized AS (
  SELECT DISTINCT ON (org_id, email)
    org_id,
    email,
    coalesce(first_name, CASE WHEN full_name LIKE '% %' THEN left(full_name, length(full_name) - strpos(reverse(full_name), ' ')) ELSE full_name END) AS first_name,
    coalesce(last_name, CASE WHEN full_name LIKE '% %' THEN right(full_name, strpos(reverse(full_name), ' ') - 1) ELSE NULL END) AS last_name,
    phone
  FROM extracted
  WHERE email IS NOT NULL
  ORDER BY org_id, email
)
INSERT INTO visitors (org_id, email, first_name, last_name, phone)
SELECT org_id, email, first_name, last_name, phone FROM normalized
ON CONFLICT (org_id, email) WHERE deleted_at IS NULL DO UPDATE SET
  first_name = coalesce(visitors.first_name, excluded.first_name),
  last_name = coalesce(visitors.last_name, excluded.last_name),
  phone = coalesce(visitors.phone, excluded.phone),
  updated_at = now();

UPDATE visits v
SET visitor_id = vis.id
FROM visitors vis
WHERE v.visitor_id IS NULL
  AND vis.org_id = v.org_id
  AND vis.deleted_at IS NULL
  AND lower(nullif(trim(coalesce(
    v.form_response->>'email',
    v.form_response->>'contact.email',
    v.form_response->>'contact_email'
  )), '')) = lower(vis.email::text);

UPDATE waitlist_entries w
SET visitor_id = vis.id
FROM visitors vis
WHERE w.visitor_id IS NULL
  AND vis.org_id = w.org_id
  AND vis.deleted_at IS NULL
  AND lower(nullif(trim(coalesce(
    w.form_response->>'email',
    w.form_response->>'contact.email',
    w.form_response->>'contact_email'
  )), '')) = lower(vis.email::text);

-- Down Migration
DROP TABLE IF EXISTS visitor_segments CASCADE;
ALTER TABLE waitlist_entries DROP COLUMN IF EXISTS visitor_id;
ALTER TABLE visits DROP COLUMN IF EXISTS visitor_id;
DROP TABLE IF EXISTS visitors CASCADE;
