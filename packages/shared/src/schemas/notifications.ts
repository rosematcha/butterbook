import { z } from 'zod';

// Keys we ship seeded templates for; admin UI can only test-send these. Keep
// in sync with apps/api/src/services/notifications/default-templates.ts.
export const NOTIFICATION_TEMPLATE_KEYS = [
  'visit.confirmation',
  'visit.cancelled',
  'waitlist.promoted',
  'event.published',
  'invitation.created',
] as const;

export const notificationTemplateKeySchema = z.enum(NOTIFICATION_TEMPLATE_KEYS);
export type NotificationTemplateKey = z.infer<typeof notificationTemplateKeySchema>;

export const NOTIFICATION_STATUSES = [
  'pending',
  'sending',
  'sent',
  'failed',
  'suppressed',
  'dead',
] as const;

export const notificationStatusSchema = z.enum(NOTIFICATION_STATUSES);
export type NotificationStatus = z.infer<typeof notificationStatusSchema>;

export const testSendNotificationSchema = z
  .object({
    toAddress: z.string().email(),
  })
  .strict();

export type TestSendNotificationInput = z.infer<typeof testSendNotificationSchema>;
