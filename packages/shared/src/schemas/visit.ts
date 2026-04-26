import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './primitives.js';

export const bookingMethodSchema = z.enum(['self', 'admin', 'kiosk']);
export const visitStatusSchema = z.enum(['confirmed', 'cancelled', 'no_show']);

export const adminCreateVisitSchema = z
  .object({
    locationId: uuidSchema,
    eventId: uuidSchema.nullable().optional(),
    scheduledAt: isoDateTimeSchema,
    formResponse: z.record(z.unknown()),
  })
  .strict();

export const selfBookingSchema = z
  .object({
    scheduledAt: isoDateTimeSchema,
    formResponse: z.record(z.unknown()),
  })
  .strict();

/**
 * Constraints chosen to keep tag lists human-readable and the UI predictable:
 * - 32 chars per tag is enough for "school group Tuesday" without becoming a
 *   paragraph.
 * - 20 tags per visit is already far more than any reasonable triage scheme.
 * - Leading/trailing whitespace is trimmed server-side so "VIP " and "VIP"
 *   don't both appear in suggestions.
 */
export const visitTagSchema = z
  .string()
  .trim()
  .min(1, 'Tag cannot be empty.')
  .max(32, 'Tag is too long.');
export const visitTagsSchema = z.array(visitTagSchema).max(20, 'Too many tags.');

export const updateVisitSchema = z
  .object({
    scheduledAt: isoDateTimeSchema.optional(),
    formResponse: z.record(z.unknown()).optional(),
    status: visitStatusSchema.optional(),
    tags: visitTagsSchema.optional(),
  })
  .strict();

export const listVisitsQuerySchema = z.object({
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
  location_id: uuidSchema.optional(),
  event_id: uuidSchema.optional(),
  method: bookingMethodSchema.optional(),
  status: visitStatusSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export const bulkVisitIdsSchema = z
  .object({
    visitIds: z.array(uuidSchema).min(1).max(500),
  })
  .strict();

export const kioskCheckinSchema = z
  .object({
    formResponse: z.record(z.unknown()),
    guestPassCode: z.string().trim().min(1).max(80).optional(),
  })
  .strict();
