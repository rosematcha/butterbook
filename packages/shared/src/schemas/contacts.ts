import { z } from 'zod';
import { emailSchema, isoDateTimeSchema, paginationSchema, uuidSchema } from './primitives.js';
import { visitTagsSchema } from './visit.js';

export const visitorAddressSchema = z
  .object({
    line1: z.string().max(200).optional(),
    line2: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    region: z.string().max(100).optional(),
    postal: z.string().max(40).optional(),
    country: z.string().max(2).optional(),
  })
  .strict();

export const createContactSchema = z
  .object({
    email: emailSchema,
    firstName: z.string().trim().min(1).max(100).nullable().optional(),
    lastName: z.string().trim().min(1).max(100).nullable().optional(),
    phone: z.string().trim().min(1).max(50).nullable().optional(),
    address: visitorAddressSchema.nullable().optional(),
    tags: visitTagsSchema.optional(),
    notes: z.string().max(5000).nullable().optional(),
  })
  .strict();

export const updateContactSchema = createContactSchema.partial().strict();

export const listContactsQuerySchema = paginationSchema.extend({
  q: z.string().trim().min(1).max(200).optional(),
  tag: z.union([z.string().trim().min(1).max(32), z.array(z.string().trim().min(1).max(32))]).optional(),
  include_deleted: z.enum(['true', 'false']).optional(),
});

export const contactIdParamSchema = z.object({ orgId: uuidSchema, id: uuidSchema });

export const mergeContactsSchema = z
  .object({
    keepId: uuidSchema,
    mergeIds: z.array(uuidSchema).min(1).max(25),
  })
  .strict()
  .refine((v) => !v.mergeIds.includes(v.keepId), {
    message: 'mergeIds cannot include keepId.',
    path: ['mergeIds'],
  });

export const segmentFilterSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.object({ and: z.array(segmentFilterSchema).min(1).max(20) }).strict(),
    z.object({ or: z.array(segmentFilterSchema).min(1).max(20) }).strict(),
    z.object({ tag: z.string().trim().min(1).max(32) }).strict(),
    z.object({ emailDomain: z.string().trim().min(1).max(120) }).strict(),
    z.object({ visitedAfter: isoDateTimeSchema }).strict(),
    z.object({ visitedBefore: isoDateTimeSchema }).strict(),
    z.object({ hasMembership: z.boolean() }).strict(),
  ]),
);

export const createSegmentSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    filter: segmentFilterSchema,
  })
  .strict();

export const updateSegmentSchema = createSegmentSchema.partial().strict();
export const segmentIdParamSchema = z.object({ orgId: uuidSchema, id: uuidSchema });

export type SegmentFilter = z.infer<typeof segmentFilterSchema>;
