-- The contact timeline endpoint joins notifications_outbox by (org_id, to_address)
-- to surface a contact's email history. The original index covers (org_id, created_at)
-- for org-wide listing; this one is the per-recipient lookup.

-- Up Migration
CREATE INDEX IF NOT EXISTS idx_notif_outbox_org_to_address
  ON notifications_outbox(org_id, to_address);

-- Down Migration
DROP INDEX IF EXISTS idx_notif_outbox_org_to_address;
