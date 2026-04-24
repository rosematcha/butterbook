-- Refresh the default renewal reminder copy now that the sweep supplies
-- daysOut/expiresAt variables. Customized org templates are left untouched.

-- Up Migration
UPDATE notification_templates
SET
  subject = 'Your {{orgName}} membership renews soon',
  body_html = '<p>Hi {{visitorName}},</p><p>Your {{tierName}} membership expires in {{daysOut}} days.</p>{{#if expiresAt}}<p>Membership expires {{expiresAt}}.</p>{{/if}}',
  body_text = 'Hi {{visitorName}},' || chr(10) || chr(10) || 'Your {{tierName}} membership expires in {{daysOut}} days.' || chr(10) || chr(10) || '{{#if expiresAt}}Membership expires {{expiresAt}}.{{/if}}',
  updated_at = now()
WHERE template_key = 'membership.renewal_reminder'
  AND is_customized = false;

-- Down Migration
UPDATE notification_templates
SET
  subject = 'Your {{orgName}} membership renews soon',
  body_html = '<p>Hi {{visitorName}},</p><p>Your {{tierName}} membership expires soon.</p>',
  body_text = 'Hi {{visitorName}},' || chr(10) || chr(10) || 'Your {{tierName}} membership expires soon.',
  updated_at = now()
WHERE template_key = 'membership.renewal_reminder'
  AND is_customized = false;
