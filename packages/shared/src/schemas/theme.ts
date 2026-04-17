import { z } from 'zod';
import { hexColorSchema } from './primitives.js';

export const themeSchema = z
  .object({
    primaryColor: hexColorSchema.optional(),
    secondaryColor: hexColorSchema.optional(),
    accentColor: hexColorSchema.optional(),
    fontFamily: z.enum(['system', 'serif', 'sans', 'mono']).optional(),
    buttonRadius: z.enum(['none', 'small', 'medium', 'large', 'full']).optional(),
  })
  .strict();

export type Theme = z.infer<typeof themeSchema>;
