import { z } from 'zod';
import { isoDateSchema, timeSchema } from './primitives.js';

export const createLocationSchema = z
  .object({
    name: z.string().min(1).max(200),
    address: z.string().max(500).optional(),
    zip: z.string().max(20).optional(),
    isPrimary: z.boolean().optional(),
  })
  .strict();

export const updateLocationSchema = createLocationSchema.partial();

export const hoursRowSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    openTime: timeSchema,
    closeTime: timeSchema,
    isActive: z.boolean().default(true),
  })
  .strict()
  .refine((r) => r.closeTime > r.openTime, 'closeTime must be after openTime');

export const putHoursSchema = z
  .object({
    hours: z.array(hoursRowSchema).max(50),
  })
  .strict();

export const createOverrideSchema = z
  .object({
    date: isoDateSchema,
    openTime: timeSchema.nullable(),
    closeTime: timeSchema.nullable(),
    reason: z.string().max(500).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if ((v.openTime == null) !== (v.closeTime == null)) {
      ctx.addIssue({ code: 'custom', message: 'openTime and closeTime must both be set or both null' });
    }
    if (v.openTime && v.closeTime && v.closeTime <= v.openTime) {
      ctx.addIssue({ code: 'custom', message: 'closeTime must be after openTime' });
    }
  });

export const updateOverrideSchema = z
  .object({
    openTime: timeSchema.nullable().optional(),
    closeTime: timeSchema.nullable().optional(),
    reason: z.string().max(500).optional(),
  })
  .strict();

export const createClosedDaySchema = z
  .object({
    date: isoDateSchema,
    reason: z.string().max(500).optional(),
  })
  .strict();
