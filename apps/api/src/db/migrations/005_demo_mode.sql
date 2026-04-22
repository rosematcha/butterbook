-- Demo mode marker on orgs.
--
-- `demo.butterbook.app` provisions a fresh Whitman org for each visitor, each
-- living only until inactivity pruning (default 12h). Tagging the row here —
-- instead of a separate demo_orgs table — keeps every existing route unchanged:
-- RLS, audit, reports, etc. all work identically on a demo org because it IS
-- an org. Guards like requireNotDemo() key off this single column.
--
-- Partial index (WHERE is_demo) keeps the index small on prod instances where
-- DEMO_MODE=false and this column is constant-false.
--
-- The audit-mutation trigger (migration 001) is also rewritten here to allow
-- DELETE on rows that belong to an is_demo org, gated by a session-scoped
-- GUC that only the prune script sets. Without this, hourly audit-log
-- trimming on live demo orgs would fail — and so would org deletion, since
-- we hard-delete audit rows alongside the rest of the org tree. The gate is
-- tight: even with the GUC set, deletes targeting a non-demo org row are
-- still refused, so a misplaced set_config() can't silently nuke prod audit.

-- Up Migration
ALTER TABLE orgs ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX idx_orgs_demo_updated_at ON orgs(updated_at) WHERE is_demo = true;

CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  -- Demo-prune escape hatch: the demo prune script sets
  -- app.allow_audit_delete_demo='on' inside its own transaction. The check
  -- still refuses if the target row's org_id is not an is_demo org, so the
  -- bypass can never reach production audit rows even if the GUC leaks.
  IF TG_OP = 'DELETE'
     AND current_setting('app.allow_audit_delete_demo', true) = 'on'
     AND OLD.org_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM orgs WHERE id = OLD.org_id AND is_demo = true) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

-- Down Migration
CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;
DROP INDEX IF EXISTS idx_orgs_demo_updated_at;
ALTER TABLE orgs DROP COLUMN IF EXISTS is_demo;
