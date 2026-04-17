import { describe, it, expect } from 'vitest';
import { buildFormResponseSchema, DEFAULT_FORM_FIELDS, formFieldsArraySchema } from '@butterbook/shared';

describe('form validation', () => {
  it('default form accepts valid response', () => {
    const s = buildFormResponseSchema(DEFAULT_FORM_FIELDS);
    const r = s.safeParse({ name: 'Alice', zip: '10001', party_size: 2 });
    expect(r.success).toBe(true);
  });

  it('default form rejects invalid party_size', () => {
    const s = buildFormResponseSchema(DEFAULT_FORM_FIELDS);
    expect(s.safeParse({ name: 'Alice', zip: '10001', party_size: 200 }).success).toBe(false);
    expect(s.safeParse({ name: '', zip: '10001', party_size: 1 }).success).toBe(false);
  });

  it('rejects form fields array missing system fields', () => {
    const r = formFieldsArraySchema.safeParse([
      { fieldKey: 'name', label: 'N', fieldType: 'text', required: true, isSystem: true, displayOrder: 0 },
    ]);
    expect(r.success).toBe(false);
  });
});
