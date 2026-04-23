-- Visitor self-serve manage links (SCOPE §H1.2).
--
-- org_booking_policies       — per-org policy row governing whether visitors
--                              may self-cancel/reschedule via a signed manage
--                              link, and how close to scheduled_at they can.
--                              Separate table (not a JSONB column on orgs) so
--                              per-location overrides can be added later.
--
-- A new notification template key `visit.rescheduled` is also seeded here
-- for the reschedule confirmation email.

-- Up Migration
CREATE TABLE org_booking_policies (
  org_id                   UUID PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  cancel_cutoff_hours      INT NOT NULL DEFAULT 2,
  reschedule_cutoff_hours  INT NOT NULL DEFAULT 2,
  self_cancel_enabled      BOOLEAN NOT NULL DEFAULT true,
  self_reschedule_enabled  BOOLEAN NOT NULL DEFAULT false,
  refund_policy_text       TEXT,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE org_booking_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_booking_policies FORCE  ROW LEVEL SECURITY;

CREATE POLICY p_tenant ON org_booking_policies
  USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());

-- Backfill: every existing org gets a default policy row.
INSERT INTO org_booking_policies (org_id)
SELECT id FROM orgs
ON CONFLICT (org_id) DO NOTHING;

-- Seed the new visit.rescheduled template for every existing org. Matches the
-- CROSS JOIN pattern from migration 008.
INSERT INTO notification_templates (org_id, template_key, subject, body_html, body_text)
SELECT o.id, v.template_key, v.subject, v.body_html, v.body_text
FROM orgs o
CROSS JOIN (VALUES
  (
    'visit.rescheduled',
    'Your visit has been rescheduled',
    '<p>Hi {{visitorName}},</p><p>Your visit has been rescheduled to {{scheduledAtLocal}}.</p><p>{{#if manageUrl}}Need to make another change? <a href="{{manageUrl}}">Manage your booking</a>.{{/if}}</p><p>See you at {{orgName}}.</p>',
    'Hi {{visitorName}},' || chr(10) || chr(10) || 'Your visit has been rescheduled to {{scheduledAtLocal}}.' || chr(10) || chr(10) || '{{#if manageUrl}}Need to make another change? {{manageUrl}}{{/if}}' || chr(10) || chr(10) || 'See you at {{orgName}}.'
  )
) AS v(template_key, subject, body_html, body_text)
ON CONFLICT (org_id, template_key) DO NOTHING;

-- Down Migration
DROP TABLE IF EXISTS org_booking_policies CASCADE;
DELETE FROM notification_templates WHERE template_key = 'visit.rescheduled';
