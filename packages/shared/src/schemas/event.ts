import { z } from 'zod';
import { isoDateTimeSchema, slugSchema, uuidSchema } from './primitives.js';
import { formFieldsArraySchema } from './form.js';

export const createEventSchema = z
  .object({
    locationId: uuidSchema,
    title: z.string().min(1).max(200),
    description: z.string().max(10_000).optional(),
    startsAt: isoDateTimeSchema,
    endsAt: isoDateTimeSchema,
    capacity: z.number().int().positive().nullable().optional(),
    waitlistEnabled: z.boolean().optional(),
    waitlistAutoPromote: z.boolean().optional(),
    formFields: formFieldsArraySchema.nullable().optional(),
    slug: slugSchema.nullable().optional(),
  })
  .strict()
  .refine((v) => new Date(v.endsAt).getTime() > new Date(v.startsAt).getTime(), {
    message: 'endsAt must be after startsAt',
  });

export const updateEventSchema = z
  .object({
    locationId: uuidSchema.optional(),
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(10_000).optional(),
    startsAt: isoDateTimeSchema.optional(),
    endsAt: isoDateTimeSchema.optional(),
    capacity: z.number().int().positive().nullable().optional(),
    waitlistEnabled: z.boolean().optional(),
    waitlistAutoPromote: z.boolean().optional(),
    formFields: formFieldsArraySchema.nullable().optional(),
  })
  .strict();

export const setSlugSchema = z.object({ slug: slugSchema.nullable() }).strict();

export const reorderWaitlistSchema = z
  .object({
    afterEntryId: uuidSchema.optional(),
    beforeEntryId: uuidSchema.optional(),
  })
  .strict()
  .refine((v) => v.afterEntryId != null || v.beforeEntryId != null, {
    message: 'provide afterEntryId or beforeEntryId',
  });

export const registerForEventSchema = z
  .object({
    formResponse: z.record(z.unknown()),
  })
  .strict();
