-- Admin-owned booking page customization (see plan: improve user autonomy).
--
-- org_booking_page    — per-org content and scheduling rules driving the
--                       public /book page. Kept separate from the orgs table
--                       so the editor is decoupled from the core org record
--                       and future per-location overrides can be added.

-- Up Migration
CREATE TABLE org_booking_page (
  org_id                    UUID PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  hero_title                TEXT,
  hero_subtitle             TEXT,
  hero_image_url            TEXT,
  intro_markdown            TEXT,
  confirmation_markdown     TEXT,
  confirmation_redirect_url TEXT,
  show_policy_on_page       BOOLEAN NOT NULL DEFAULT true,
  lead_time_min_hours       INT     NOT NULL DEFAULT 0   CHECK (lead_time_min_hours BETWEEN 0 AND 720),
  booking_window_days       INT     NOT NULL DEFAULT 60  CHECK (booking_window_days BETWEEN 1 AND 365),
  max_party_size            INT     CHECK (max_party_size IS NULL OR max_party_size BETWEEN 1 AND 500),
  intake_schedules          BOOLEAN NOT NULL DEFAULT false,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE org_booking_page ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_booking_page FORCE  ROW LEVEL SECURITY;

CREATE POLICY p_tenant ON org_booking_page
  USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());

-- Backfill: every existing org gets a default content row.
INSERT INTO org_booking_page (org_id)
SELECT id FROM orgs
ON CONFLICT (org_id) DO NOTHING;

-- Down Migration
DROP TABLE IF EXISTS org_booking_page CASCADE;
