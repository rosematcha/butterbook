-- Recurring event series support.
--
-- `event_series` stores the durable recurrence rule and grouping metadata.
-- Generated occurrences continue to live in `events`, preserving existing
-- registration, waitlist, publish, reporting, and deletion behavior.

-- Up Migration
CREATE TABLE event_series (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES orgs(id) ON DELETE RESTRICT,
  created_by         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title              TEXT NOT NULL,
  slug_base          TEXT,
  frequency          TEXT NOT NULL CHECK (frequency IN ('weekly')),
  weekday            SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  first_starts_at    TIMESTAMPTZ NOT NULL,
  duration_minutes   INT NOT NULL CHECK (duration_minutes > 0),
  until_date         DATE,
  occurrence_count   INT CHECK (occurrence_count IS NULL OR occurrence_count > 0),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (((until_date IS NOT NULL)::int + (occurrence_count IS NOT NULL)::int) = 1)
);
CREATE INDEX idx_event_series_org ON event_series(org_id);
CREATE INDEX idx_event_series_first_starts_at ON event_series(first_starts_at);
CREATE TRIGGER event_series_updated_at BEFORE UPDATE ON event_series FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE event_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_series FORCE  ROW LEVEL SECURITY;

CREATE POLICY p_tenant ON event_series
  USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());

ALTER TABLE events
  ADD COLUMN series_id UUID REFERENCES event_series(id) ON DELETE SET NULL,
  ADD COLUMN series_ordinal INT,
  ADD CONSTRAINT events_series_link_consistency
    CHECK (
      (series_id IS NULL AND series_ordinal IS NULL)
      OR
      (series_id IS NOT NULL AND series_ordinal IS NOT NULL AND series_ordinal > 0)
    );

CREATE INDEX idx_events_series_id ON events(series_id) WHERE deleted_at IS NULL AND series_id IS NOT NULL;
CREATE UNIQUE INDEX idx_events_series_ordinal ON events(series_id, series_ordinal) WHERE series_id IS NOT NULL;

-- Down Migration
DROP INDEX IF EXISTS idx_events_series_ordinal;
DROP INDEX IF EXISTS idx_events_series_id;
ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_series_link_consistency,
  DROP COLUMN IF EXISTS series_ordinal,
  DROP COLUMN IF EXISTS series_id;

DROP TABLE IF EXISTS event_series CASCADE;
