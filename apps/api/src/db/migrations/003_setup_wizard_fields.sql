-- Setup-wizard captured org context.
--
-- The new-org wizard collects a fuller picture than the legacy one-page form:
-- a normalized address (country/city/state on top of the existing street +
-- ZIP), plus two cosmetic preferences — how the org talks about bookings
-- ('appointment' vs 'visit') and whether bookings carry start+end / start /
-- no time. Callers consume these to swap UI copy and later to drive time-picker
-- variants; no visits-table change yet.
--
-- All columns are defaulted or nullable so existing rows stay valid with no
-- backfill and CI can replay 001→002→003 cleanly from zero.
ALTER TABLE orgs ADD COLUMN country      TEXT NOT NULL DEFAULT 'US';
ALTER TABLE orgs ADD COLUMN city         TEXT;
ALTER TABLE orgs ADD COLUMN state        TEXT;
ALTER TABLE orgs ADD COLUMN terminology  TEXT NOT NULL DEFAULT 'visit'
  CHECK (terminology IN ('appointment','visit'));
ALTER TABLE orgs ADD COLUMN time_model   TEXT NOT NULL DEFAULT 'start_only'
  CHECK (time_model IN ('start_end','start_only','untimed'));

-- Primary location is seeded from the org's address in services/orgs.ts.
-- Keep the same columns available so the seed + future multi-location edits
-- stay aligned.
ALTER TABLE locations ADD COLUMN country TEXT;
ALTER TABLE locations ADD COLUMN city    TEXT;
ALTER TABLE locations ADD COLUMN state   TEXT;
