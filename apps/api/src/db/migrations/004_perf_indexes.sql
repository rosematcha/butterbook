-- Composite indexes to back the hottest dashboard reads.
--
-- day-view visits list: WHERE org_id = $1 AND location_id = $2
--   AND scheduled_at BETWEEN $3 AND $4
-- Existing idx_visits_org_scheduled(org_id, scheduled_at) handles the
-- unfiltered case; adding location_id in between lets Postgres skip the
-- per-location recheck when the admin filters by location.
CREATE INDEX IF NOT EXISTS idx_visits_org_location_scheduled
  ON visits(org_id, location_id, scheduled_at);

-- "open" visits for a day: Today-view / active-list queries often omit
-- cancelled rows. Partial index keeps the index small.
CREATE INDEX IF NOT EXISTS idx_visits_org_status_scheduled
  ON visits(org_id, status, scheduled_at) WHERE status <> 'cancelled';

-- Events list: WHERE org_id = $1 AND deleted_at IS NULL ORDER BY starts_at.
-- Existing idx_events_org + idx_events_starts_at each cover half; composite
-- with the deleted_at partial predicate makes the ORDER BY free.
CREATE INDEX IF NOT EXISTS idx_events_org_starts_at
  ON events(org_id, starts_at) WHERE deleted_at IS NULL;
