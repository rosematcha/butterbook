-- Event bus foundation (SCOPE §CC.1).
--
-- Every tenant mutation already writes an audit_log row inside withOrgContext's
-- transaction. This adds a sibling `event_outbox` row in the *same* tx so
-- downstream subscribers (notifications, webhooks, integrations) can pick up
-- domain events without polling audit_log directly. Keeping the outbox separate
-- from audit_log preserves the append-only invariant on the audit table — the
-- worker needs to UPDATE status on outbox rows, which the audit trigger forbids.
--
-- Policy note: same permissive-on-NULL shape as audit_log so the worker can
-- poll without a session org set. Setting app.current_org_id restricts reads
-- as usual.

-- Up Migration
CREATE TABLE event_outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  aggregate_type  TEXT NOT NULL,
  aggregate_id    UUID NOT NULL,
  payload         JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','dispatched','failed','dead')),
  attempts        INT NOT NULL DEFAULT 0,
  max_attempts    INT NOT NULL DEFAULT 10,
  last_error      TEXT,
  available_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_by       TEXT,
  locked_until    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  dispatched_at   TIMESTAMPTZ
);

-- Partial index keeps the poll hot-path (status='pending') cheap even when
-- millions of dispatched rows accumulate before a retention sweep.
CREATE INDEX idx_event_outbox_poll
  ON event_outbox(available_at)
  WHERE status = 'pending';
CREATE INDEX idx_event_outbox_org_created
  ON event_outbox(org_id, created_at DESC);

ALTER TABLE event_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY p_tenant ON event_outbox
  USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null() OR org_id IS NULL);

-- Down Migration
DROP TABLE IF EXISTS event_outbox CASCADE;
