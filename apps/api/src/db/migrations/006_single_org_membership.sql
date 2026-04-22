-- Enforce one org per user. Each user can have at most one membership row,
-- including soft-deleted ones (we no longer reactivate stale memberships —
-- once a user is removed from an org, that's terminal for that user).
ALTER TABLE org_members
  ADD CONSTRAINT org_members_user_id_unique UNIQUE (user_id);
