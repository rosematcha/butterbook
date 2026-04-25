import { z } from 'zod';
import { emailSchema, uuidSchema } from './primitives.js';

export const BROADCAST_STATUSES = ['draft', 'sending', 'sent', 'failed'] as const;
export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number];

export const createBroadcastSchema = z
  .object({
    segmentId: uuidSchema.nullable().optional(),
    subject: z.string().trim().min(1).max(200),
    bodyHtml: z.string().min(1).max(50_000),
    bodyText: z.string().min(1).max(50_000),
  })
  .strict();

export const updateBroadcastSchema = z
  .object({
    segmentId: uuidSchema.nullable().optional(),
    subject: z.string().trim().min(1).max(200).optional(),
    bodyHtml: z.string().min(1).max(50_000).optional(),
    bodyText: z.string().min(1).max(50_000).optional(),
  })
  .strict();

export const broadcastIdParamSchema = z.object({ orgId: uuidSchema, broadcastId: uuidSchema });

export const broadcastTestSendSchema = z.object({ toAddress: emailSchema }).strict();

export const listBroadcastsQuerySchema = z
  .object({
    status: z.enum(BROADCAST_STATUSES).optional(),
  })
  .strict();
