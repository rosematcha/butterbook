import { describe, it, expect } from 'vitest';
import { visitTagSchema, visitTagsSchema, updateVisitSchema } from '@butterbook/shared';

describe('visit tag schema', () => {
  it('trims surrounding whitespace', () => {
    const r = visitTagSchema.safeParse('  VIP  ');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('VIP');
  });

  it('rejects empty or whitespace-only tags', () => {
    expect(visitTagSchema.safeParse('').success).toBe(false);
    expect(visitTagSchema.safeParse('   ').success).toBe(false);
  });

  it('rejects tags over 32 chars', () => {
    expect(visitTagSchema.safeParse('a'.repeat(33)).success).toBe(false);
    expect(visitTagSchema.safeParse('a'.repeat(32)).success).toBe(true);
  });

  it('accepts up to 20 tags per visit', () => {
    const ok = Array.from({ length: 20 }, (_, i) => `tag-${i}`);
    expect(visitTagsSchema.safeParse(ok).success).toBe(true);
    expect(visitTagsSchema.safeParse([...ok, 'overflow']).success).toBe(false);
  });

  it('accepts an empty array', () => {
    expect(visitTagsSchema.safeParse([]).success).toBe(true);
  });

  it('updateVisitSchema accepts tags-only body', () => {
    const r = updateVisitSchema.safeParse({ tags: ['VIP', 'school'] });
    expect(r.success).toBe(true);
  });

  it('updateVisitSchema still rejects unknown fields (strict)', () => {
    const r = updateVisitSchema.safeParse({ tags: ['ok'], nonsense: 1 });
    expect(r.success).toBe(false);
  });
});
