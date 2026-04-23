import { z } from 'zod';
import { isoDateSchema, isoDateTimeSchema, slugSchema, uuidSchema } from './primitives.js';
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

const weeklyRecurrenceEndSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('until_date'),
    untilDate: isoDateSchema,
  }).strict(),
  z.object({
    mode: z.literal('after_occurrences'),
    occurrenceCount: z.number().int().positive().max(366),
  }).strict(),
]);

export const createEventSeriesSchema = z
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
    slugBase: slugSchema.nullable().optional(),
    recurrence: z.object({
      frequency: z.literal('weekly'),
      weekday: z.number().int().min(0).max(6),
      ends: weeklyRecurrenceEndSchema,
    }).strict(),
  })
  .strict()
  .refine((v) => new Date(v.endsAt).getTime() > new Date(v.startsAt).getTime(), {
    message: 'endsAt must be after startsAt',
  });

export const duplicateEventSchema = z
  .object({
    locationId: uuidSchema.optional(),
    title: z.string().min(1).max(200).optional(),
    startsAt: isoDateTimeSchema.optional(),
    endsAt: isoDateTimeSchema.optional(),
    capacity: z.number().int().positive().nullable().optional(),
    waitlistEnabled: z.boolean().optional(),
    waitlistAutoPromote: z.boolean().optional(),
    slug: slugSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.startsAt == null) !== (value.endsAt == null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'startsAt and endsAt must be provided together',
        path: value.startsAt == null ? ['startsAt'] : ['endsAt'],
      });
    }
    if (value.startsAt && value.endsAt && new Date(value.endsAt).getTime() <= new Date(value.startsAt).getTime()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'endsAt must be after startsAt',
        path: ['endsAt'],
      });
    }
  });

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
