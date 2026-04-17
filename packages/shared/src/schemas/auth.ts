import { z } from 'zod';
import { emailSchema, passwordSchema, totpCodeSchema } from './primitives.js';

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    displayName: z.string().min(1).max(200).optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(256),
    totpCode: totpCodeSchema.optional(),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(256),
    newPassword: passwordSchema,
  })
  .strict();

export const totpConfirmSchema = z.object({ code: totpCodeSchema }).strict();
export const totpDisableSchema = z
  .object({ code: totpCodeSchema, password: z.string().min(1).max(256) })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
