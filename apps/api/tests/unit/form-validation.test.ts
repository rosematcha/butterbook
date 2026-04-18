import { describe, it, expect } from 'vitest';
import {
  buildFormResponseSchema,
  DEFAULT_FORM_FIELDS,
  formFieldsArraySchema,
  getPrimaryLabel,
  type FormField,
} from '@butterbook/shared';

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

  it('accepts an arbitrary minimal field set (no system-required enforcement)', () => {
    const r = formFieldsArraySchema.safeParse([
      { fieldKey: 'handle', label: 'Handle', fieldType: 'text', required: true, isSystem: false, displayOrder: 0 },
    ]);
    expect(r.success).toBe(true);
  });

  it('rejects duplicate field keys', () => {
    const r = formFieldsArraySchema.safeParse([
      { fieldKey: 'a', label: 'A', fieldType: 'text', required: true, isSystem: false, displayOrder: 0 },
      { fieldKey: 'a', label: 'A2', fieldType: 'text', required: false, isSystem: false, displayOrder: 1 },
    ]);
    expect(r.success).toBe(false);
  });

  it('rejects more than one primary label', () => {
    const r = formFieldsArraySchema.safeParse([
      { fieldKey: 'a', label: 'A', fieldType: 'text', required: true, isSystem: false, isPrimaryLabel: true, displayOrder: 0 },
      { fieldKey: 'b', label: 'B', fieldType: 'text', required: true, isSystem: false, isPrimaryLabel: true, displayOrder: 1 },
    ]);
    expect(r.success).toBe(false);
  });

  it('validates email, phone, url, date, time types', () => {
    const fields: FormField[] = [
      { fieldKey: 'email', label: 'Email', fieldType: 'email', required: true, isSystem: false, isPrimaryLabel: false, displayOrder: 0 },
      { fieldKey: 'phone', label: 'Phone', fieldType: 'phone', required: true, isSystem: false, isPrimaryLabel: false, displayOrder: 1 },
      { fieldKey: 'site', label: 'Site', fieldType: 'url', required: false, isSystem: false, isPrimaryLabel: false, displayOrder: 2 },
      { fieldKey: 'birthday', label: 'Birthday', fieldType: 'date', required: true, isSystem: false, isPrimaryLabel: false, displayOrder: 3 },
      { fieldKey: 'slot', label: 'Slot', fieldType: 'time', required: true, isSystem: false, isPrimaryLabel: false, displayOrder: 4 },
    ];
    const s = buildFormResponseSchema(fields);
    expect(
      s.safeParse({ email: 'a@b.co', phone: '+1 (555) 123-4567', site: 'https://example.com', birthday: '1990-05-01', slot: '14:30' }).success,
    ).toBe(true);
    expect(s.safeParse({ email: 'not-an-email', phone: '+1', birthday: '1990-05-01', slot: '14:30' }).success).toBe(false);
    expect(s.safeParse({ email: 'a@b.co', phone: 'letters-bad', birthday: '1990-05-01', slot: '14:30' }).success).toBe(false);
    expect(s.safeParse({ email: 'a@b.co', phone: '555-1234', birthday: '1990-5-01', slot: '14:30' }).success).toBe(false);
  });

  it('supports custom regex pattern with hint', () => {
    const fields: FormField[] = [
      {
        fieldKey: 'ticket',
        label: 'Ticket code',
        fieldType: 'text',
        required: true,
        isSystem: false,
        isPrimaryLabel: false,
        displayOrder: 0,
        validation: { pattern: '^[A-Z]{2}\\d{4}$', patternHint: 'Two letters, four digits' },
      },
    ];
    const s = buildFormResponseSchema(fields);
    expect(s.safeParse({ ticket: 'AB1234' }).success).toBe(true);
    expect(s.safeParse({ ticket: 'ab1234' }).success).toBe(false);
  });

  it('supports multiselect with min/max items', () => {
    const fields: FormField[] = [
      {
        fieldKey: 'interests',
        label: 'Interests',
        fieldType: 'multiselect',
        required: true,
        isSystem: false,
        isPrimaryLabel: false,
        displayOrder: 0,
        options: ['art', 'history', 'science'],
        validation: { minItems: 1, maxItems: 2 },
      },
    ];
    const s = buildFormResponseSchema(fields);
    expect(s.safeParse({ interests: ['art'] }).success).toBe(true);
    expect(s.safeParse({ interests: ['art', 'history'] }).success).toBe(true);
    expect(s.safeParse({ interests: [] }).success).toBe(false);
    expect(s.safeParse({ interests: ['art', 'history', 'science'] }).success).toBe(false);
    expect(s.safeParse({ interests: ['unknown'] }).success).toBe(false);
  });

  it('number field honors integer flag', () => {
    const fields: FormField[] = [
      {
        fieldKey: 'count',
        label: 'Count',
        fieldType: 'number',
        required: true,
        isSystem: false,
        isPrimaryLabel: false,
        displayOrder: 0,
        validation: { integer: true, min: 0 },
      },
    ];
    const s = buildFormResponseSchema(fields);
    expect(s.safeParse({ count: 3 }).success).toBe(true);
    expect(s.safeParse({ count: 3.5 }).success).toBe(false);
  });

  it('getPrimaryLabel prefers isPrimaryLabel, then name, then first text field', () => {
    const withPrimary: FormField[] = [
      { fieldKey: 'handle', label: 'Handle', fieldType: 'text', required: true, isSystem: false, isPrimaryLabel: true, displayOrder: 0 },
      { fieldKey: 'name', label: 'Name', fieldType: 'text', required: false, isSystem: false, isPrimaryLabel: false, displayOrder: 1 },
    ];
    expect(getPrimaryLabel(withPrimary, { handle: 'neo', name: 'Thomas' })).toBe('neo');

    const noPrimary: FormField[] = [
      { fieldKey: 'name', label: 'Name', fieldType: 'text', required: true, isSystem: false, isPrimaryLabel: false, displayOrder: 0 },
    ];
    expect(getPrimaryLabel(noPrimary, { name: 'Trinity' })).toBe('Trinity');

    const anything: FormField[] = [
      { fieldKey: 'email', label: 'Email', fieldType: 'email', required: true, isSystem: false, isPrimaryLabel: false, displayOrder: 0 },
    ];
    expect(getPrimaryLabel(anything, { email: 'a@b.co' })).toBe('a@b.co');

    expect(getPrimaryLabel([], {})).toBe(null);
  });
});
