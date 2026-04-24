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
      '<p>Hi {{visitorName}},</p><p>Your visit is confirmed for {{scheduledAtLocal}}.</p>{{#if manageUrl}}<p>Need to cancel or make changes? <a href="{{manageUrl}}">Manage your booking</a>.</p>{{/if}}<p>We look forward to seeing you at {{orgName}}.</p>',
    bodyText:
      'Hi {{visitorName}},\n\nYour visit is confirmed for {{scheduledAtLocal}}.\n\n{{#if manageUrl}}Need to cancel or make changes? {{manageUrl}}\n\n{{/if}}We look forward to seeing you at {{orgName}}.',
  },
  {
    templateKey: 'visit.cancelled',
    subject: 'Your visit has been cancelled',
    bodyHtml:
      '<p>Hi {{visitorName}},</p><p>Your visit scheduled for {{scheduledAtLocal}} has been cancelled.</p><p>If this was a mistake, please contact {{orgName}}.</p>',
    bodyText:
      'Hi {{visitorName}},\n\nYour visit scheduled for {{scheduledAtLocal}} has been cancelled.\n\nIf this was a mistake, please contact {{orgName}}.',
  },
  {
    templateKey: 'waitlist.promoted',
    subject: "You're off the waitlist",
    bodyHtml:
      '<p>Hi {{visitorName}},</p><p>A spot opened up for {{eventName}} on {{scheduledAtLocal}}. You\u2019re confirmed.</p>{{#if manageUrl}}<p>Need to cancel? <a href="{{manageUrl}}">Manage your booking</a>.</p>{{/if}}<p>See you at {{orgName}}.</p>',
    bodyText:
      'Hi {{visitorName}},\n\nA spot opened up for {{eventName}} on {{scheduledAtLocal}}. You\u2019re confirmed.\n\n{{#if manageUrl}}Need to cancel? {{manageUrl}}\n\n{{/if}}See you at {{orgName}}.',
  },
  {
    templateKey: 'visit.rescheduled',
    subject: 'Your visit has been rescheduled',
    bodyHtml:
      '<p>Hi {{visitorName}},</p><p>Your visit has been rescheduled to {{scheduledAtLocal}}.</p>{{#if manageUrl}}<p>Need to make another change? <a href="{{manageUrl}}">Manage your booking</a>.</p>{{/if}}<p>See you at {{orgName}}.</p>',
    bodyText:
      'Hi {{visitorName}},\n\nYour visit has been rescheduled to {{scheduledAtLocal}}.\n\n{{#if manageUrl}}Need to make another change? {{manageUrl}}\n\n{{/if}}See you at {{orgName}}.',
  },
  {
    templateKey: 'event.published',
    subject: 'New event at {{orgName}}: {{eventName}}',
    bodyHtml:
      '<p>{{orgName}} has published a new event: <strong>{{eventName}}</strong>.</p><p><a href="{{eventUrl}}">View details and register</a></p>',
    bodyText:
      '{{orgName}} has published a new event: {{eventName}}.\n\nView details and register: {{eventUrl}}',
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
      '<p>Hi {{visitorName}},</p><p>Your {{tierName}} membership at {{orgName}} is active.</p>{{#if expiresAt}}<p>Membership expires {{expiresAt}}.</p>{{/if}}',
    bodyText:
      'Hi {{visitorName}},\n\nYour {{tierName}} membership at {{orgName}} is active.\n\n{{#if expiresAt}}Membership expires {{expiresAt}}.{{/if}}',
  },
  {
    templateKey: 'membership.renewal_reminder',
    subject: 'Your {{orgName}} membership renews soon',
    bodyHtml:
      '<p>Hi {{visitorName}},</p><p>Your {{tierName}} membership expires in {{daysOut}} days.</p>{{#if expiresAt}}<p>Membership expires {{expiresAt}}.</p>{{/if}}',
    bodyText:
      'Hi {{visitorName}},\n\nYour {{tierName}} membership expires in {{daysOut}} days.\n\n{{#if expiresAt}}Membership expires {{expiresAt}}.{{/if}}',
  },
  {
    templateKey: 'membership.expired',
    subject: 'Your {{orgName}} membership has expired',
    bodyHtml:
      '<p>Hi {{visitorName}},</p><p>Your {{tierName}} membership has expired.</p>',
    bodyText:
      'Hi {{visitorName}},\n\nYour {{tierName}} membership has expired.',
  },
  {
    templateKey: 'membership.lapsed',
    subject: 'Your {{orgName}} membership has lapsed',
    bodyHtml:
      '<p>Hi {{visitorName}},</p><p>Your {{tierName}} membership has lapsed.</p>',
    bodyText:
      'Hi {{visitorName}},\n\nYour {{tierName}} membership has lapsed.',
  },
  {
    templateKey: 'membership.cancelled',
    subject: 'Your {{orgName}} membership was cancelled',
    bodyHtml:
      '<p>Hi {{visitorName}},</p><p>Your {{tierName}} membership was cancelled.</p>',
    bodyText:
      'Hi {{visitorName}},\n\nYour {{tierName}} membership was cancelled.',
  },
  {
    templateKey: 'membership.payment_failed',
    subject: 'Membership payment failed',
    bodyHtml:
      '<p>Hi {{visitorName}},</p><p>We could not process payment for your {{tierName}} membership.</p>',
    bodyText:
      'Hi {{visitorName}},\n\nWe could not process payment for your {{tierName}} membership.',
  },
  {
    templateKey: 'broadcast.generic',
    subject: '{{subject}}',
    bodyHtml: '{{{bodyHtml}}}',
    bodyText: '{{bodyText}}',
  },
];
