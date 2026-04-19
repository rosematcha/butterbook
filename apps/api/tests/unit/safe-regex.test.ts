import { describe, expect, it } from 'vitest';
import type { FormField } from '@butterbook/shared';
import { isSafePattern, assertSafeFormFieldPatterns } from '../../src/utils/safe-regex.js';

describe('safe-regex — ReDoS guard on user-supplied form-field patterns', () => {
  it('accepts benign patterns', () => {
    expect(isSafePattern('^[0-9]{5}$')).toBe(true);
    expect(isSafePattern('^[A-Za-z ]+$')).toBe(true);
    expect(isSafePattern('^(yes|no)$')).toBe(true);
  });

  it('rejects classic catastrophic-backtracking shapes', () => {
    // safe-regex2 is heuristic, not exhaustive — it reliably catches nested
    // quantifiers and high-star-height shapes, which cover the most common
    // exponential-backtracking footguns.
    expect(isSafePattern('(a+)+$')).toBe(false);
    expect(isSafePattern('(.*a){20}')).toBe(false);
    expect(isSafePattern('(a*)*b')).toBe(false);
  });

  it('rejects syntactically invalid patterns', () => {
    expect(isSafePattern('([unclosed')).toBe(false);
  });

  it('assertSafeFormFieldPatterns throws a 422 ValidationError on unsafe pattern', () => {
    const fields: FormField[] = [{
      fieldKey: 'zip',
      label: 'ZIP',
      fieldType: 'text',
      required: true,
      isSystem: false,
      isPrimaryLabel: false,
      displayOrder: 0,
      validation: { pattern: '(a+)+$' },
    }];
    expect(() => assertSafeFormFieldPatterns(fields)).toThrow(/unsafe regex/);
  });

  it('assertSafeFormFieldPatterns is a no-op for fields without a pattern', () => {
    const fields: FormField[] = [{
      fieldKey: 'name',
      label: 'Name',
      fieldType: 'text',
      required: true,
      isSystem: false,
      isPrimaryLabel: true,
      displayOrder: 0,
    }];
    expect(() => assertSafeFormFieldPatterns(fields)).not.toThrow();
  });
});
