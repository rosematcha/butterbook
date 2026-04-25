import { z } from 'zod';
import { isoDateTimeSchema, paginationSchema, slugSchema, uuidSchema } from './primitives.js';

export const membershipBillingIntervalSchema = z.enum(['year', 'month', 'lifetime', 'one_time']);
export const membershipStatusSchema = z.enum(['pending', 'active', 'expired', 'lapsed', 'cancelled', 'refunded']);

export const createMembershipTierSchema = z
  .object({
    slug: slugSchema,
    name: z.string().trim().min(1).max(160),
    description: z.string().max(5000).nullable().optional(),
    priceCents: z.number().int().min(0),
    billingInterval: membershipBillingIntervalSchema,
    durationDays: z.number().int().positive().max(36500).nullable().optional(),
    guestPassesIncluded: z.number().int().min(0).max(500).optional(),
    memberOnlyEventAccess: z.boolean().optional(),
    maxActive: z.number().int().positive().nullable().optional(),
    sortOrder: z.number().int().optional(),
    active: z.boolean().optional(),
  })
  .strict();

export const updateMembershipTierSchema = createMembershipTierSchema.partial().strict();
export const membershipTierIdParamSchema = z.object({ orgId: uuidSchema, tierId: uuidSchema });

export const listMembershipTiersQuerySchema = z.object({
  include_deleted: z.enum(['true', 'false']).optional(),
});

export const listMembershipsQuerySchema = paginationSchema
  .extend({
    status: membershipStatusSchema.optional(),
    tier_id: uuidSchema.optional(),
    visitor_id: uuidSchema.optional(),
    expiring_before: isoDateTimeSchema.optional(),
  })
  .strict();

export const createMembershipSchema = z
  .object({
    visitorId: uuidSchema,
    tierId: uuidSchema,
    startsAt: isoDateTimeSchema.optional(),
    expiresAt: isoDateTimeSchema.nullable().optional(),
    autoRenew: z.boolean().optional(),
    amountCents: z.number().int().min(0).optional(),
    currency: z.string().length(3).transform((s) => s.toLowerCase()).optional(),
    notes: z.string().max(2000).nullable().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const updateMembershipSchema = z
  .object({
    status: membershipStatusSchema.optional(),
    expiresAt: isoDateTimeSchema.nullable().optional(),
    autoRenew: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

export const membershipIdParamSchema = z.object({ orgId: uuidSchema, membershipId: uuidSchema });

export const cancelMembershipSchema = z
  .object({
    reason: z.string().max(1000).nullable().optional(),
  })
  .strict();

export const renewMembershipSchema = z
  .object({
    expiresAt: isoDateTimeSchema.nullable().optional(),
    amountCents: z.number().int().min(0).optional(),
    currency: z.string().length(3).transform((s) => s.toLowerCase()).optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict();

export const refundMembershipSchema = z
  .object({
    paymentId: uuidSchema.optional(),
    amountCents: z.number().int().min(0).optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict();

export const promoCodeDiscountTypeSchema = z.enum(['percent', 'amount']);
export const promoCodeCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'Use letters, numbers, dashes, or underscores.');

const promoCodeFields = z
  .object({
    code: promoCodeCodeSchema.transform((s) => s.toUpperCase()),
    description: z.string().trim().max(500).nullable().optional(),
    discountType: promoCodeDiscountTypeSchema,
    discountPercent: z.number().int().min(1).max(100).nullable().optional(),
    discountAmountCents: z.number().int().positive().nullable().optional(),
    membershipTierId: uuidSchema.nullable().optional(),
    startsAt: isoDateTimeSchema.nullable().optional(),
    expiresAt: isoDateTimeSchema.nullable().optional(),
    maxRedemptions: z.number().int().positive().nullable().optional(),
    active: z.boolean().optional(),
  })
  .strict();

export const createPromoCodeSchema = promoCodeFields
  .superRefine((val, ctx) => {
    if (val.discountType === 'percent' && val.discountPercent == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountPercent'], message: 'Required for percent discounts.' });
    }
    if (val.discountType === 'percent' && val.discountAmountCents != null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountAmountCents'], message: 'Must be empty for percent discounts.' });
    }
    if (val.discountType === 'amount' && val.discountAmountCents == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountAmountCents'], message: 'Required for amount discounts.' });
    }
    if (val.discountType === 'amount' && val.discountPercent != null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountPercent'], message: 'Must be empty for amount discounts.' });
    }
    if (val.startsAt && val.expiresAt && new Date(val.startsAt) >= new Date(val.expiresAt)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'], message: 'Must be after startsAt.' });
    }
  });

export const updatePromoCodeSchema = promoCodeFields.partial().strict().superRefine((val, ctx) => {
  if (val.discountType === 'percent' && val.discountAmountCents != null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountAmountCents'], message: 'Must be empty for percent discounts.' });
  }
  if (val.discountType === 'amount' && val.discountPercent != null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountPercent'], message: 'Must be empty for amount discounts.' });
  }
  if (val.startsAt && val.expiresAt && new Date(val.startsAt) >= new Date(val.expiresAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expiresAt'], message: 'Must be after startsAt.' });
  }
});

export const promoCodeIdParamSchema = z.object({ orgId: uuidSchema, promoCodeId: uuidSchema });
export const listPromoCodesQuerySchema = z.object({
  include_deleted: z.enum(['true', 'false']).optional(),
});

export const publicPromoCodeValidationSchema = z
  .object({
    tierId: uuidSchema,
    code: promoCodeCodeSchema.transform((s) => s.toUpperCase()),
  })
  .strict();

export const updateMembershipPolicySchema = z
  .object({
    enabled: z.boolean().optional(),
    gracePeriodDays: z.number().int().min(0).max(365).optional(),
    renewalReminderDays: z.array(z.number().int().min(0).max(365)).max(12).optional(),
    selfCancelEnabled: z.boolean().optional(),
    selfUpdateEnabled: z.boolean().optional(),
    publicPageEnabled: z.boolean().optional(),
  })
  .strict();

export const publicMembershipOrgParamSchema = z.object({ orgSlug: slugSchema });

export const publicMembershipCheckoutSchema = z
  .object({
    tierId: uuidSchema,
    email: z.string().trim().email().transform((s) => s.toLowerCase()),
    firstName: z.string().trim().min(1).max(120).optional(),
    lastName: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().min(1).max(80).optional(),
    promoCode: promoCodeCodeSchema.transform((s) => s.toUpperCase()).optional(),
    successUrl: z.string().url().optional(),
    cancelUrl: z.string().url().optional(),
  })
  .strict();
