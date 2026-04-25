-- Segment-scoped broadcasts that fan out one notifications_outbox row per
-- recipient. Drafts are editable; once sent or queued, the broadcast is locked
-- in via the status field and recipient_count is frozen.

-- Up Migration
SET search_path TO public, extensions;

CREATE TABLE broadcasts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  segment_id         UUID REFERENCES visitor_segments(id) ON DELETE SET NULL,
  subject            TEXT NOT NULL,
  body_html          TEXT NOT NULL,
  body_text          TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sending', 'sent', 'failed')),
  recipient_count    INT,
  scheduled_for      TIMESTAMPTZ,
  sent_at            TIMESTAMPTZ,
  created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_broadcasts_org_status ON broadcasts(org_id, status, created_at DESC);
CREATE INDEX idx_broadcasts_org_segment ON broadcasts(org_id, segment_id) WHERE segment_id IS NOT NULL;
CREATE TRIGGER broadcasts_updated_at BEFORE UPDATE ON broadcasts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcasts FORCE ROW LEVEL SECURITY;
CREATE POLICY p_tenant ON broadcasts USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());

-- Down Migration
DROP TABLE IF EXISTS broadcasts CASCADE;
