import type { FormField } from '@butterbook/shared';

/**
 * Snake-case, starts with a letter — match the server rule in form.ts.
 */
export function toFieldKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^[^a-z]/, 'f_$&')
    .slice(0, 64) || 'field';
}

/**
 * Given a desired fieldKey and the current list of fields, return a key that
 * doesn't collide. Suffixes with `_2`, `_3`, … as needed.
 */
export function uniqueFieldKey(base: string, existing: Pick<FormField, 'fieldKey'>[]): string {
  const keys = new Set(existing.map((f) => f.fieldKey));
  if (!keys.has(base)) return base;
  let i = 2;
  while (keys.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}
