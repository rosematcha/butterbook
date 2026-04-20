import { z } from 'zod';
import { ianaTimezoneSchema, slugSchema } from './primitives.js';
import { themeSchema } from './theme.js';
import { formFieldsArraySchema } from './form.js';

export const slotRoundingSchema = z.enum(['freeform', '5', '10', '15', '30']);
export const terminologySchema = z.enum(['appointment', 'visit']);
export const timeModelSchema = z.enum(['start_end', 'start_only', 'untimed']);

// ISO 3166-1 alpha-2, upper-case. Not an exhaustive list — just a shape check.
const countrySchema = z.string().length(2).regex(/^[A-Z]{2}$/);

export const createOrgSchema = z
  .object({
    name: z.string().min(1).max(200),
    address: z.string().min(1).max(500),
    zip: z.string().min(1).max(20),
    timezone: ianaTimezoneSchema,
    publicSlug: slugSchema.optional(),
    country: countrySchema.optional(),
    city: z.string().min(1).max(120).optional(),
    state: z.string().min(1).max(120).optional(),
    terminology: terminologySchema.optional(),
    timeModel: timeModelSchema.optional(),
    formFields: formFieldsArraySchema.optional(),
  })
  .strict();

export const updateOrgSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    address: z.string().min(1).max(500).optional(),
    zip: z.string().min(1).max(20).optional(),
    timezone: ianaTimezoneSchema.optional(),
    slugPrefix: z.string().min(1).max(32).regex(/^[a-z0-9-]+$/).optional(),
    slotRounding: slotRoundingSchema.optional(),
    kioskResetSeconds: z.number().int().min(3).max(300).optional(),
    publicSlug: slugSchema.optional(),
    country: countrySchema.optional(),
    city: z.string().min(1).max(120).optional(),
    state: z.string().min(1).max(120).optional(),
    terminology: terminologySchema.optional(),
    timeModel: timeModelSchema.optional(),
  })
  .strict();

export const updateBrandingSchema = z
  .object({
    logoUrl: z.string().url().max(2000).nullable().optional(),
    theme: themeSchema.optional(),
  })
  .strict();

export const putFormSchema = z
  .object({
    fields: formFieldsArraySchema,
  })
  .strict();

export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;
