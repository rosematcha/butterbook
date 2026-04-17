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

export const updateVisitSchema = z
  .object({
    scheduledAt: isoDateTimeSchema.optional(),
    formResponse: z.record(z.unknown()).optional(),
    status: visitStatusSchema.optional(),
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

export const kioskCheckinSchema = z
  .object({
    formResponse: z.record(z.unknown()),
  })
  .strict();
