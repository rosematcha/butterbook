import { z } from 'zod';

// Trim + null-out empty strings so admins can clear optional fields by
// blanking the input box. Keeps the storage shape (nullable TEXT) clean.
const nullableText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => (s.trim() === '' ? null : s))
    .nullable()
    .optional();

const nullableUrl = z
  .string()
  .url()
  .max(2000)
  .transform((s) => (s.trim() === '' ? null : s))
  .or(z.literal('').transform(() => null))
  .nullable()
  .optional();

export const updateBookingPageSchema = z
  .object({
    heroTitle: nullableText(200),
    heroSubtitle: nullableText(400),
    heroImageUrl: nullableUrl,
    introMarkdown: nullableText(4000),
    confirmationMarkdown: nullableText(4000),
    confirmationRedirectUrl: nullableUrl,
    showPolicyOnPage: z.boolean().optional(),
    leadTimeMinHours: z.number().int().min(0).max(720).optional(),
    bookingWindowDays: z.number().int().min(1).max(365).optional(),
    maxPartySize: z.number().int().min(1).max(500).nullable().optional(),
    intakeSchedules: z.boolean().optional(),
  })
  .strict();

export type UpdateBookingPageInput = z.infer<typeof updateBookingPageSchema>;

export interface BookingPageContent {
  heroTitle: string | null;
  heroSubtitle: string | null;
  heroImageUrl: string | null;
  introMarkdown: string | null;
  confirmationMarkdown: string | null;
  confirmationRedirectUrl: string | null;
  showPolicyOnPage: boolean;
  leadTimeMinHours: number;
  bookingWindowDays: number;
  maxPartySize: number | null;
  intakeSchedules: boolean;
}
