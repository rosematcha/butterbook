-- Visit tags. Free-form, tenant-scoped labels admins can stick on a visit
-- (e.g. "VIP", "school group", "needs wheelchair") for quick triage on the
-- Today timeline. Stored as a text[] so we get array ops + a GIN index for
-- cheap "which visits carry this tag" filtering without a join table.
ALTER TABLE visits ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}';

-- GIN index supports @> / && / ANY lookups used by tag filtering and
-- "frequently-used tag" aggregation. Partial predicate keeps it small —
-- most visits have no tags.
CREATE INDEX idx_visits_tags_gin ON visits USING gin (tags) WHERE cardinality(tags) > 0;
