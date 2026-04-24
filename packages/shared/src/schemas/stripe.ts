import { z } from 'zod';
import { uuidSchema } from './primitives.js';

export const stripeOrgParamSchema = z.object({ orgId: uuidSchema });

export const stripeConnectCallbackQuerySchema = z
  .object({
    code: z.string().min(1).optional(),
    state: z.string().min(1),
    error: z.string().optional(),
    error_description: z.string().optional(),
  })
  .strict();
