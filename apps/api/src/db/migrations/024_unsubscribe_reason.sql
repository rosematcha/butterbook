-- Add 'unsubscribe' to the notification_suppressions reason CHECK constraint
-- so visitor-initiated opt-outs are distinguished from bounces/complaints/manual.

-- Up Migration
ALTER TABLE notification_suppressions
  DROP CONSTRAINT IF EXISTS notification_suppressions_reason_check;
ALTER TABLE notification_suppressions
  ADD CONSTRAINT notification_suppressions_reason_check
  CHECK (reason IN ('bounce','complaint','manual','unsubscribe'));

-- Down Migration
ALTER TABLE notification_suppressions
  DROP CONSTRAINT IF EXISTS notification_suppressions_reason_check;
ALTER TABLE notification_suppressions
  ADD CONSTRAINT notification_suppressions_reason_check
  CHECK (reason IN ('bounce','complaint','manual'));
