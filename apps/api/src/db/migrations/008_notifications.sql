-- Transactional notifications (SCOPE §H1.1).
--
-- Three tables:
--   notification_templates       — per-org Handlebars templates, seeded with
--                                  defaults on org-create and via backfill
--                                  here for existing orgs.
--   notifications_outbox         — per-delivery row; worker's notifications
--                                  loop claims pending rows with
--                                  FOR UPDATE SKIP LOCKED.
--   notification_suppressions    — bounce/complaint/manual suppression list.
--
-- All three follow the permissive-on-NULL RLS shape so the worker can poll
-- without a session org; subscribers switch into withOrgContext(row.org_id, …)
-- before reading templates / writing outbox rows.

-- Up Migration
CREATE TABLE notification_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  template_key  TEXT NOT NULL,
  subject       TEXT NOT NULL,
  body_html     TEXT NOT NULL,
  body_text     TEXT NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, template_key)
);
CREATE INDEX idx_notif_templates_org ON notification_templates(org_id);

CREATE TABLE notifications_outbox (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  kind                  TEXT NOT NULL DEFAULT 'email' CHECK (kind IN ('email')),
  to_address            TEXT NOT NULL,
  template_key          TEXT NOT NULL,
  rendered_subject      TEXT NOT NULL,
  rendered_html         TEXT NOT NULL,
  rendered_text         TEXT NOT NULL,
  payload               JSONB NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','sending','sent','failed','suppressed','dead')),
  attempts              INT NOT NULL DEFAULT 0,
  max_attempts          INT NOT NULL DEFAULT 5,
  last_error            TEXT,
  scheduled_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at               TIMESTAMPTZ,
  provider_message_id   TEXT,
  locked_by             TEXT,
  locked_until          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_outbox_poll
  ON notifications_outbox(scheduled_at)
  WHERE status = 'pending';
CREATE INDEX idx_notif_outbox_org_created
  ON notifications_outbox(org_id, created_at DESC);

CREATE TABLE notification_suppressions (
  org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  address     TEXT NOT NULL,
  reason      TEXT NOT NULL CHECK (reason IN ('bounce','complaint','manual')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, address)
);
-- Case-insensitive uniqueness via functional index (can't put lower() in the
-- PK). The app normalizes on write; this guards against callers that forget.
CREATE UNIQUE INDEX idx_notif_suppressions_org_addr_lower
  ON notification_suppressions(org_id, lower(address));

ALTER TABLE notification_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates      FORCE  ROW LEVEL SECURITY;
ALTER TABLE notifications_outbox        ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_outbox        FORCE  ROW LEVEL SECURITY;
ALTER TABLE notification_suppressions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_suppressions   FORCE  ROW LEVEL SECURITY;

CREATE POLICY p_tenant ON notification_templates
  USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());
CREATE POLICY p_tenant ON notifications_outbox
  USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null() OR org_id IS NULL);
CREATE POLICY p_tenant ON notification_suppressions
  USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null());

-- Seed default templates for every existing org. New orgs get the same set
-- inserted in the org-create tx (see services/orgs.ts).
INSERT INTO notification_templates (org_id, template_key, subject, body_html, body_text)
SELECT o.id, v.template_key, v.subject, v.body_html, v.body_text
FROM orgs o
CROSS JOIN (VALUES
  (
    'visit.confirmation',
    'Your visit is confirmed',
    '<p>Hi {{visitorName}},</p><p>Your visit is confirmed for {{scheduledAtLocal}}.</p><p>We look forward to seeing you at {{orgName}}.</p>',
    'Hi {{visitorName}},' || chr(10) || chr(10) || 'Your visit is confirmed for {{scheduledAtLocal}}.' || chr(10) || chr(10) || 'We look forward to seeing you at {{orgName}}.'
  ),
  (
    'visit.cancelled',
    'Your visit has been cancelled',
    '<p>Hi {{visitorName}},</p><p>Your visit scheduled for {{scheduledAtLocal}} has been cancelled.</p><p>If this was a mistake, please contact {{orgName}}.</p>',
    'Hi {{visitorName}},' || chr(10) || chr(10) || 'Your visit scheduled for {{scheduledAtLocal}} has been cancelled.' || chr(10) || chr(10) || 'If this was a mistake, please contact {{orgName}}.'
  ),
  (
    'waitlist.promoted',
    'You''re off the waitlist',
    '<p>Hi {{visitorName}},</p><p>A spot opened up for {{eventName}} on {{scheduledAtLocal}}. You''re confirmed.</p><p>See you at {{orgName}}.</p>',
    'Hi {{visitorName}},' || chr(10) || chr(10) || 'A spot opened up for {{eventName}} on {{scheduledAtLocal}}. You''re confirmed.' || chr(10) || chr(10) || 'See you at {{orgName}}.'
  ),
  (
    'event.published',
    'New event at {{orgName}}: {{eventName}}',
    '<p>{{orgName}} has published a new event: <strong>{{eventName}}</strong>.</p><p><a href="{{eventUrl}}">View details and register</a></p>',
    '{{orgName}} has published a new event: {{eventName}}.' || chr(10) || chr(10) || 'View details and register: {{eventUrl}}'
  ),
  (
    'invitation.created',
    'You''ve been invited to join {{orgName}}',
    '<p>{{inviterName}} has invited you to join <strong>{{orgName}}</strong> on Butterbook.</p><p><a href="{{acceptUrl}}">Accept invitation</a></p>',
    '{{inviterName}} has invited you to join {{orgName}} on Butterbook.' || chr(10) || chr(10) || 'Accept invitation: {{acceptUrl}}'
  )
) AS v(template_key, subject, body_html, body_text)
ON CONFLICT (org_id, template_key) DO NOTHING;

-- Down Migration
DROP TABLE IF EXISTS notification_suppressions CASCADE;
DROP TABLE IF EXISTS notifications_outbox CASCADE;
DROP TABLE IF EXISTS notification_templates CASCADE;
