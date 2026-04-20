import { z } from 'zod';

export const fieldKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, 'lowercase snake_case starting with a letter');

// A practical phone matcher: digits plus common separators, 7–20 chars.
// Not E.164-strict on purpose — that's up to the org's patternHint if they care.
const PHONE_REGEX = /^[+0-9()\-.\s]{7,20}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{2}:\d{2}$/;

export const fieldTypeSchema = z.enum([
  'text',
  'textarea',
  'number',
  'email',
  'phone',
  'url',
  'date',
  'time',
  'select',
  'multiselect',
  'radio',
  'checkbox',
]);
export type FieldType = z.infer<typeof fieldTypeSchema>;

export const formFieldValidationSchema = z
  .object({
    // text / textarea
    minLength: z.number().int().nonnegative().optional(),
    maxLength: z.number().int().positive().max(10000).optional(),
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
    // Short human-readable hint shown when pattern fails (e.g. "8-digit ID").
    patternHint: z.string().max(200).optional(),
    // number
    min: z.number().optional(),
    max: z.number().optional(),
    integer: z.boolean().optional(),
    // multiselect
    minItems: z.number().int().nonnegative().optional(),
    maxItems: z.number().int().positive().max(200).optional(),
  })
  .strict();

export const formFieldSchema = z
  .object({
    fieldKey: fieldKeySchema,
    label: z.string().min(1).max(200).regex(/^[^<>]*$/, 'HTML tags are not allowed in labels'),
    fieldType: fieldTypeSchema,
    required: z.boolean(),
    /**
     * Historically marked "system" (immutable) fields. Retained on the type so
     * existing data round-trips, but no longer enforced — every field is now
     * user-editable. Treat this flag as informational only.
     */
    isSystem: z.boolean().optional().default(false),
    /**
     * Marks the field whose value is used as the visitor's display label in
     * lists (timeline card, visits list, etc.). At most one field should set
     * this. If none do, consumers fall back to the first text-typed field.
     */
    isPrimaryLabel: z.boolean().optional().default(false),
    displayOrder: z.number().int().nonnegative(),
    placeholder: z.string().max(200).optional(),
    helpText: z.string().max(500).optional(),
    options: z.array(z.string().min(1).max(200)).max(200).optional(),
    validation: formFieldValidationSchema.optional(),
  })
  .strict()
  .superRefine((f, ctx) => {
    if ((f.fieldType === 'select' || f.fieldType === 'multiselect' || f.fieldType === 'radio')) {
      if (!f.options || f.options.length === 0) {
        ctx.addIssue({ code: 'custom', message: `${f.fieldType} fields require non-empty options` });
      }
    }
    if (f.fieldType === 'checkbox' && f.isPrimaryLabel) {
      ctx.addIssue({ code: 'custom', message: 'isPrimaryLabel cannot be set on a checkbox field' });
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
    const primaries = fields.filter((f) => f.isPrimaryLabel);
    if (primaries.length > 1) {
      ctx.addIssue({ code: 'custom', message: 'only one field may be marked isPrimaryLabel' });
    }
  });

export type FormField = z.infer<typeof formFieldSchema>;
export type FormFields = z.infer<typeof formFieldsArraySchema>;

/**
 * Sensible starter form for a brand-new org. Users can edit or remove any of
 * these — there are no required fields at the platform level.
 */
export const DEFAULT_FORM_FIELDS: FormField[] = [
  {
    fieldKey: 'name',
    label: 'Name',
    fieldType: 'text',
    required: true,
    isSystem: false,
    isPrimaryLabel: true,
    displayOrder: 0,
    validation: { minLength: 1, maxLength: 200 },
  },
  {
    fieldKey: 'zip',
    label: 'ZIP / Postal Code',
    fieldType: 'text',
    required: false,
    isSystem: false,
    isPrimaryLabel: false,
    displayOrder: 1,
    validation: { minLength: 1, maxLength: 20 },
  },
  {
    fieldKey: 'party_size',
    label: 'Party size',
    fieldType: 'number',
    required: true,
    isSystem: false,
    isPrimaryLabel: false,
    displayOrder: 2,
    validation: { min: 1, max: 100, integer: true },
  },
];

/**
 * Minimum viable intake form — just the visitor's name. The setup wizard
 * starts the user here so they can add fields from a clean slate. Other
 * callers (bootstrap CLI, tests) continue to use DEFAULT_FORM_FIELDS.
 */
export const MINIMAL_NAME_FIELD: FormField[] = [DEFAULT_FORM_FIELDS[0]!];

/**
 * Build a Zod validator for a form response from the list of form fields.
 * Handles all supported field types, including implicit regexes for
 * email/phone/url/date/time and custom user-supplied patterns for text.
 */
export function buildFormResponseSchema(fields: FormField[]): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    let base: z.ZodTypeAny;
    switch (f.fieldType) {
      case 'text':
      case 'textarea': {
        let s = z.string();
        if (f.validation?.minLength != null) s = s.min(f.validation.minLength);
        if (f.validation?.maxLength != null) s = s.max(f.validation.maxLength);
        if (f.validation?.pattern != null) {
          const hint = f.validation.patternHint ?? 'invalid format';
          s = s.regex(new RegExp(f.validation.pattern), hint);
        }
        base = s;
        break;
      }
      case 'number': {
        let n = z.number();
        if (f.validation?.integer) n = n.int();
        if (f.validation?.min != null) n = n.min(f.validation.min);
        if (f.validation?.max != null) n = n.max(f.validation.max);
        base = n;
        break;
      }
      case 'email':
        base = z.string().email();
        break;
      case 'phone':
        base = z.string().regex(PHONE_REGEX, 'invalid phone number');
        break;
      case 'url':
        base = z.string().url();
        break;
      case 'date':
        base = z.string().regex(DATE_REGEX, 'expected YYYY-MM-DD');
        break;
      case 'time':
        base = z.string().regex(TIME_REGEX, 'expected HH:MM');
        break;
      case 'select':
      case 'radio': {
        const opts = f.options ?? [];
        base = z.enum([opts[0] ?? '', ...opts.slice(1)] as [string, ...string[]]);
        break;
      }
      case 'multiselect': {
        const opts = f.options ?? [];
        let arr = z.array(z.enum([opts[0] ?? '', ...opts.slice(1)] as [string, ...string[]]));
        if (f.validation?.minItems != null) arr = arr.min(f.validation.minItems);
        if (f.validation?.maxItems != null) arr = arr.max(f.validation.maxItems);
        base = arr;
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

/**
 * Resolve the best "display name" for a visitor given their form response.
 * Prefers the field marked `isPrimaryLabel`, then a legacy `name` key, then
 * the first text/email field with a value. Returns null if nothing usable.
 */
export function getPrimaryLabel(
  fields: FormField[],
  response: Record<string, unknown>,
): string | null {
  const primary = fields.find((f) => f.isPrimaryLabel);
  const tryVal = (key: string): string | null => {
    const v = response[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
    return null;
  };
  if (primary) {
    const v = tryVal(primary.fieldKey);
    if (v) return v;
  }
  if ('name' in response) {
    const v = tryVal('name');
    if (v) return v;
  }
  const firstText = fields.find((f) =>
    f.fieldType === 'text' || f.fieldType === 'textarea' || f.fieldType === 'email',
  );
  if (firstText) {
    const v = tryVal(firstText.fieldKey);
    if (v) return v;
  }
  return null;
}
