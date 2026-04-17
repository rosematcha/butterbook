import { z } from 'zod';

export const uuidSchema = z.string().uuid();
export const emailSchema = z.string().email().max(320).transform((s) => s.toLowerCase());
export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
export const timeSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'must be HH:MM[:SS]');
export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const slugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase alphanumeric with hyphens');
export const passwordSchema = z.string().min(12).max(256);
export const totpCodeSchema = z.string().regex(/^\d{6}$/);
export const ianaTimezoneSchema = z
  .string()
  .min(1)
  .max(128)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'invalid IANA timezone');

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export type Pagination = z.infer<typeof paginationSchema>;
