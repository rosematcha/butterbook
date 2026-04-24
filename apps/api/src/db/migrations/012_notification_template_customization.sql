-- Track whether an org notification template has been edited away from the
-- shipped default. Existing rows are seeded/default unless an admin edits them.

-- Up Migration
ALTER TABLE notification_templates
  ADD COLUMN is_customized BOOLEAN NOT NULL DEFAULT false;

-- Down Migration
ALTER TABLE notification_templates
  DROP COLUMN IF EXISTS is_customized;
