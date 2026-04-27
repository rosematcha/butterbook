// Seed templates. Kept in sync with the backfill INSERT in
// 008_notifications.sql — edits here also belong in the next migration.
export interface DefaultTemplate {
  templateKey: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    templateKey: 'visit.confirmation',
    subject: 'Your visit is confirmed',
    bodyHtml:
      '<p>Hi {{visitorName}},</p><p>Your visit is confirmed for {{scheduledAtLocal}}.</p>{{#if manageUrl}}<p>Need to cancel or make changes? <a href="{{manageUrl}}">Manage your booking</a>.</p>{{/if}}<p>We look forward to seeing you at {{orgName}}.</p>{{#if unsubscribeUrl}}<p style="font-size:12px;color:#999;margin-top:24px"><a href="{{unsubscribeUrl}}">Unsubscribe</a> from emails by {{orgName}}.</p>{{/if}}',
    bodyText:
      'Hi {{visitorName}},\n\nYour visit is confirmed for {{scheduledAtLocal}}.\n\n{{#if manageUrl}}Need to cancel or make changes? {{manageUrl}}\n\n{{/if}}We look forward to seeing you at {{orgName}}.\n\n{{#if unsubscribeUrl}}Unsubscribe: {{unsubscribeUrl}}{{/if}}',
  },
  {
    templateKey: 'visit.cancelled',
    subject: 'Your visit has been cancelled',
    bodyHtml:
      '<p>Hi {{visitorName}},</p><p>Your visit scheduled for {{scheduledAtLocal}} has been cancelled.</p><p>If this was a mistake, please contact {{orgName}}.</p>{{#if unsubscribeUrl}}<p style="font-size:12px;color:#999;margin-top:24px"><a href="{{unsubscribeUrl}}">Unsubscribe</a> from emails by {{orgName}}.</p>{{/if}}',
    bodyText:
      'Hi {{visitorName}},\n\nYour visit scheduled for {{scheduledAtLocal}} has been cancelled.\n\nIf this was a mistake, please contact {{orgName}}.\n\n{{#if unsubscribeUrl}}Unsubscribe: {{unsubscribeUrl}}{{/if}}',
  },
  {
    templateKey: 'waitlist.promoted',
    subject: "You're off the waitlist",
    bodyHtml:
      '<p>Hi {{visitorName}},</p><p>A spot opened up for {{eventName}} on {{scheduledAtLocal}}. You\u2019re confirmed.</p>{{#if manageUrl}}<p>Need to cancel? <a href="{{manageUrl}}">Manage your booking</a>.</p>{{/if}}<p>See you at {{orgName}}.</p>{{#if unsubscribeUrl}}<p style="font-size:12px;color:#999;margin-top:24px"><a href="{{unsubscribeUrl}}">Unsubscribe</a> from emails by {{orgName}}.</p>{{/if}}',
    bodyText:
      'Hi {{visitorName}},\n\nA spot opened up for {{eventName}} on {{scheduledAtLocal}}. You\u2019re confirmed.\n\n{{#if manageUrl}}Need to cancel? {{manageUrl}}\n\n{{/if}}See you at {{orgName}}.\n\n{{#if unsubscribeUrl}}Unsubscribe: {{unsubscribeUrl}}{{/if}}',
  },
  {
    templateKey: 'visit.rescheduled',
    subject: 'Your visit has been rescheduled',
    bodyHtml:
      '<p>Hi {{visitorName}},</p><p>Your visit has been rescheduled to {{scheduledAtLocal}}.</p>{{#if manageUrl}}<p>Need to make another change? <a href="{{manageUrl}}">Manage your booking</a>.</p>{{/if}}<p>See you at {{orgName}}.</p>{{#if unsubscribeUrl}}<p style="font-size:12px;color:#999;margin-top:24px"><a href="{{unsubscribeUrl}}">Unsubscribe</a> from emails by {{orgName}}.</p>{{/if}}',
    bodyText:
      'Hi {{visitorName}},\n\nYour visit has been rescheduled to {{scheduledAtLocal}}.\n\n{{#if manageUrl}}Need to make another change? {{manageUrl}}\n\n{{/if}}See you at {{orgName}}.\n\n{{#if unsubscribeUrl}}Unsubscribe: {{unsubscribeUrl}}{{/if}}',
  },
  {
    templateKey: 'event.published',
    subject: 'New event at {{orgName}}: {{eventName}}',
    bodyHtml:
      '<p>{{orgName}} has published a new event: <strong>{{eventName}}</strong>.</p><p><a href="{{eventUrl}}">View details and register</a></p>{{#if unsubscribeUrl}}<p style="font-size:12px;color:#999;margin-top:24px"><a href="{{unsubscribeUrl}}">Unsubscribe</a> from emails by {{orgName}}.</p>{{/if}}',
    bodyText:
      '{{orgName}} has published a new event: {{eventName}}.\n\nView details and register: {{eventUrl}}\n\n{{#if unsubscribeUrl}}Unsubscribe: {{unsubscribeUrl}}{{/if}}',
  },
  {
    templateKey: 'invitation.created',
    subject: "You've been invited to join {{orgName}}",
    bodyHtml:
      '<p>{{inviterName}} has invited you to join <strong>{{orgName}}</strong> on Butterbook.</p><p><a href="{{acceptUrl}}">Accept invitation</a></p>',
    bodyText:
      '{{inviterName}} has invited you to join {{orgName}} on Butterbook.\n\nAccept invitation: {{acceptUrl}}',
  },
  {
    templateKey: 'membership.welcome',
    subject: 'Your {{tierName}} membership is active',
    bodyHtml:
      '<p>Hi {{visitorName}},</p><p>Your {{tierName}} membership at {{orgName}} is active.</p>{{#if expiresAt}}<p>Membership expires {{expiresAt}}.</p>{{/if}}{{#if unsubscribeUrl}}<p style="font-size:12px;color:#999;margin-top:24px"><a href="{{unsubscribeUrl}}">Unsubscribe</a> from emails by {{orgName}}.</p>{{/if}}',
    bodyText:
      'Hi {{visitorName}},\n\nYour {{tierName}} membership at {{orgName}} is active.\n\n{{#if expiresAt}}Membership expires {{expiresAt}}.{{/if}}\n\n{{#if unsubscribeUrl}}Unsubscribe: {{unsubscribeUrl}}{{/if}}',
  },
  {
    templateKey: 'membership.renewal_reminder',
    subject: 'Your {{orgName}} membership renews soon',
    bodyHtml:
      '<p>Hi {{visitorName}},</p><p>Your {{tierName}} membership expires in {{daysOut}} days.</p>{{#if expiresAt}}<p>Membership expires {{expiresAt}}.</p>{{/if}}{{#if unsubscribeUrl}}<p style="font-size:12px;color:#999;margin-top:24px"><a href="{{unsubscribeUrl}}">Unsubscribe</a> from emails by {{orgName}}.</p>{{/if}}',
    bodyText:
      'Hi {{visitorName}},\n\nYour {{tierName}} membership expires in {{daysOut}} days.\n\n{{#if expiresAt}}Membership expires {{expiresAt}}.{{/if}}\n\n{{#if unsubscribeUrl}}Unsubscribe: {{unsubscribeUrl}}{{/if}}',
  },
  {
    templateKey: 'membership.expired',
    subject: 'Your {{orgName}} membership has expired',
    bodyHtml:
      '<p>Hi {{visitorName}},</p><p>Your {{tierName}} membership has expired.</p>{{#if unsubscribeUrl}}<p style="font-size:12px;color:#999;margin-top:24px"><a href="{{unsubscribeUrl}}">Unsubscribe</a> from emails by {{orgName}}.</p>{{/if}}',
    bodyText:
      'Hi {{visitorName}},\n\nYour {{tierName}} membership has expired.\n\n{{#if unsubscribeUrl}}Unsubscribe: {{unsubscribeUrl}}{{/if}}',
  },
  {
    templateKey: 'membership.lapsed',
    subject: 'Your {{orgName}} membership has lapsed',
    bodyHtml:
      '<p>Hi {{visitorName}},</p><p>Your {{tierName}} membership has lapsed.</p>{{#if unsubscribeUrl}}<p style="font-size:12px;color:#999;margin-top:24px"><a href="{{unsubscribeUrl}}">Unsubscribe</a> from emails by {{orgName}}.</p>{{/if}}',
    bodyText:
      'Hi {{visitorName}},\n\nYour {{tierName}} membership has lapsed.\n\n{{#if unsubscribeUrl}}Unsubscribe: {{unsubscribeUrl}}{{/if}}',
  },
  {
    templateKey: 'membership.cancelled',
    subject: 'Your {{orgName}} membership was cancelled',
    bodyHtml:
      '<p>Hi {{visitorName}},</p><p>Your {{tierName}} membership was cancelled.</p>{{#if unsubscribeUrl}}<p style="font-size:12px;color:#999;margin-top:24px"><a href="{{unsubscribeUrl}}">Unsubscribe</a> from emails by {{orgName}}.</p>{{/if}}',
    bodyText:
      'Hi {{visitorName}},\n\nYour {{tierName}} membership was cancelled.\n\n{{#if unsubscribeUrl}}Unsubscribe: {{unsubscribeUrl}}{{/if}}',
  },
  {
    templateKey: 'membership.payment_failed',
    subject: 'Membership payment failed',
    bodyHtml:
      '<p>Hi {{visitorName}},</p><p>We could not process payment for your {{tierName}} membership.</p>{{#if unsubscribeUrl}}<p style="font-size:12px;color:#999;margin-top:24px"><a href="{{unsubscribeUrl}}">Unsubscribe</a> from emails by {{orgName}}.</p>{{/if}}',
    bodyText:
      'Hi {{visitorName}},\n\nWe could not process payment for your {{tierName}} membership.\n\n{{#if unsubscribeUrl}}Unsubscribe: {{unsubscribeUrl}}{{/if}}',
  },
  // broadcast.generic is a marker template, not a rendered one. Broadcasts
  // pre-render their own subject/body in renderBroadcastFor and write the
  // rendered_subject/html/text directly to the outbox. The template_key is
  // stored on each outbox row so admins can filter the outbox by "broadcasts"
  // vs transactional emails. Keeping a row in notification_templates with a
  // self-substituting body lets admins customise these defaults without
  // crashing if a future delivery worker ever tries to look it up.
  {
    templateKey: 'broadcast.generic',
    subject: '{{subject}}',
    bodyHtml: '{{{bodyHtml}}}',
    bodyText: '{{bodyText}}',
  },
];
