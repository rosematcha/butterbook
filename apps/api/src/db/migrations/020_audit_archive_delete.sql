-- Allow the archive script to delete old audit_log rows by setting
-- SET LOCAL app.allow_audit_archive_delete = 'on' inside a transaction.
-- The trigger still blocks all other mutations.

CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  -- Demo prune path (existing)
  IF TG_OP = 'DELETE'
     AND current_setting('app.allow_audit_delete_demo', true) = 'on'
     AND OLD.org_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM orgs WHERE id = OLD.org_id AND is_demo = true) THEN
    RETURN OLD;
  END IF;
  -- Archive path: allows bulk deletion of aged rows
  IF TG_OP = 'DELETE'
     AND current_setting('app.allow_audit_archive_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

-- Down Migration
CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('app.allow_audit_delete_demo', true) = 'on'
     AND OLD.org_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM orgs WHERE id = OLD.org_id AND is_demo = true) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;
