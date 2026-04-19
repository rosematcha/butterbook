import safeRegex from 'safe-regex2';
import { ValidationError } from '../errors/index.js';
import type { FormField } from '@butterbook/shared';

// Reject user-supplied form-field regex patterns that exhibit catastrophic
// backtracking, e.g. (a+)+$, ^(a|a)*$. An org admin (malicious or compromised)
// could otherwise install such a pattern and hang the event loop when guests
// submit forms that fail to match. safe-regex2 is a pure-JS heuristic check;
// it catches the common nested-quantifier / alternation-overlap structures
// that cause exponential backtracking in JS regex engines.

export function isSafePattern(p: string): boolean {
  try {
    // Also ensure it's a syntactically valid regex (redundant with the Zod
    // refine but cheap).
    new RegExp(p);
  } catch {
    return false;
  }
  return safeRegex(p);
}

/**
 * Throw 422 if any text/textarea field has a `validation.pattern` whose
 * regex structure could trigger catastrophic backtracking. Called at every
 * form-save boundary so stored patterns are always safe.
 */
export function assertSafeFormFieldPatterns(fields: FormField[]): void {
  for (const f of fields) {
    const p = f.validation?.pattern;
    if (!p) continue;
    if (!isSafePattern(p)) {
      throw new ValidationError(
        `Field "${f.fieldKey}" has an unsafe regex pattern (catastrophic backtracking risk). Simplify the expression.`,
      );
    }
  }
}
