import { describe, expect, it } from 'vitest';
import { toCsv } from '../../src/services/reports.js';

describe('toCsv — OWASP CSV-injection hardening', () => {
  it('prefixes formula-starter chars with a single quote', () => {
    const out = toCsv(
      ['name'],
      [
        ['=cmd|\'/c calc\'!A1'],
        ['+1+1'],
        ['-HYPERLINK("http://evil")'],
        ['@SUM(A1:A2)'],
        ['\tTAB'],
        ['\rCR'],
      ],
    );
    const rows = out.split('\n');
    // All six values have either a quote-requiring char OR bare text. Because
    // `=cmd|'/c calc'!A1` now begins with `'=` it still has `"` via the
    // single-quote prefix — toCsv only double-quotes when the string contains
    // one of `",\n\r`, so the `=`-prefixed output is bare except the first `'`.
    expect(rows[1]).toBe("'=cmd|'/c calc'!A1"); // leading single-quote added
    expect(rows[2]).toBe("'+1+1");
    expect(rows[3]).toBe('"\'-HYPERLINK(""http://evil"")"');
    expect(rows[4]).toBe("'@SUM(A1:A2)");
    expect(rows[5]).toBe("'\tTAB");
    // Bare \r triggers the CRLF quote-escape path too.
    expect(rows[6]).toMatch(/^"'\rCR"$/);
  });

  it('does not alter safe values', () => {
    const out = toCsv(['a', 'b'], [['hello', 'world'], [42, null]]);
    expect(out).toBe('a,b\nhello,world\n42,');
  });

  it('still escapes embedded quotes and newlines', () => {
    const out = toCsv(['x'], [['he said "hi"'], ['line1\nline2']]);
    const rows = out.split('\n');
    expect(rows[1]).toBe('"he said ""hi"""');
    // A newline inside a quoted field doesn't count as a row separator when we
    // split by \n, but the field itself is quoted — verify the quote wrapper.
    expect(out).toContain('"line1\nline2"');
  });
});
