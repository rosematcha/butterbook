import { z } from 'zod';

export const fieldKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, 'lowercase snake_case starting with a letter');

export const formFieldValidationSchema = z
  .object({
    minLength: z.number().int().nonnegative().optional(),
    maxLength: z.number().int().positive().max(10000).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z
      .string()
      .max(512)
      .refine((p) => {
        try {
          new RegExp(p);
          return true;
        } catch {
          return false;
        }
      }, 'invalid regex')
      .optional(),
  })
  .strict();

export const formFieldSchema = z
  .object({
    fieldKey: fieldKeySchema,
    label: z.string().min(1).max(200),
    fieldType: z.enum(['text', 'number', 'select', 'checkbox']),
    required: z.boolean(),
    isSystem: z.boolean(),
    displayOrder: z.number().int().nonnegative(),
    options: z.array(z.string().min(1).max(200)).max(200).optional(),
    validation: formFieldValidationSchema.optional(),
  })
  .strict()
  .superRefine((f, ctx) => {
    if (f.fieldType === 'select' && (!f.options || f.options.length === 0)) {
      ctx.addIssue({ code: 'custom', message: 'select fields require non-empty options' });
    }
  });

export const formFieldsArraySchema = z
  .array(formFieldSchema)
  .max(200)
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();
    for (const f of fields) {
      if (seen.has(f.fieldKey)) {
        ctx.addIssue({ code: 'custom', message: `duplicate field key: ${f.fieldKey}` });
      }
      seen.add(f.fieldKey);
    }
    const systemRequired = ['name', 'zip', 'party_size'] as const;
    for (const key of systemRequired) {
      const match = fields.find((f) => f.fieldKey === key);
      if (!match) {
        ctx.addIssue({ code: 'custom', message: `system field missing: ${key}` });
      } else if (!match.isSystem) {
        ctx.addIssue({ code: 'custom', message: `system field ${key} must have isSystem=true` });
      } else if (!match.required) {
        ctx.addIssue({ code: 'custom', message: `system field ${key} must be required` });
      }
    }
  });

export type FormField = z.infer<typeof formFieldSchema>;
export type FormFields = z.infer<typeof formFieldsArraySchema>;

export const DEFAULT_FORM_FIELDS: FormField[] = [
  {
    fieldKey: 'name',
    label: 'Name',
    fieldType: 'text',
    required: true,
    isSystem: true,
    displayOrder: 0,
    validation: { minLength: 1, maxLength: 200 },
  },
  {
    fieldKey: 'zip',
    label: 'ZIP / Postal Code',
    fieldType: 'text',
    required: true,
    isSystem: true,
    displayOrder: 1,
    validation: { minLength: 1, maxLength: 20 },
  },
  {
    fieldKey: 'party_size',
    label: 'Party size',
    fieldType: 'number',
    required: true,
    isSystem: true,
    displayOrder: 2,
    validation: { min: 1, max: 100 },
  },
];

// Build a Zod validator for a form response from the list of form fields.
export function buildFormResponseSchema(fields: FormField[]): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    let base: z.ZodTypeAny;
    switch (f.fieldType) {
      case 'text': {
        let s = z.string();
        if (f.validation?.minLength != null) s = s.min(f.validation.minLength);
        if (f.validation?.maxLength != null) s = s.max(f.validation.maxLength);
        if (f.validation?.pattern != null) s = s.regex(new RegExp(f.validation.pattern));
        base = s;
        break;
      }
      case 'number': {
        let n = z.number();
        if (f.validation?.min != null) n = n.min(f.validation.min);
        if (f.validation?.max != null) n = n.max(f.validation.max);
        base = n;
        break;
      }
      case 'select': {
        const opts = f.options ?? [];
        base = z.enum([opts[0] ?? '', ...opts.slice(1)] as [string, ...string[]]);
        break;
      }
      case 'checkbox':
        base = z.boolean();
        break;
    }
    shape[f.fieldKey] = f.required ? base : base.optional();
  }
  return z.object(shape).strict();
}
