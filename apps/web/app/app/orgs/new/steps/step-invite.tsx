'use client';
import type { StepProps } from '../types';

// Matches primitives.ts emailSchema's shape (z.string().email().max(320)).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(s: string): boolean {
  const t = s.trim();
  return t.length > 0 && t.length <= 320 && EMAIL_REGEX.test(t);
}

export function StepInvite({ state, patch }: StepProps) {
  const invites = state.invites;

  function updateEmail(idx: number, email: string) {
    const copy = invites.slice();
    copy[idx] = { email };
    patch({ invites: copy });
  }

  function removeRow(idx: number) {
    const copy = invites.slice();
    copy.splice(idx, 1);
    patch({ invites: copy });
  }

  function addRow() {
    patch({ invites: [...invites, { email: '' }] });
  }

  return (
    <div className="grid gap-5">
      <div>
        <div className="h-eyebrow">Invite teammates</div>
        <p className="mt-1 text-xs text-paper-500">
          We&apos;ll send each teammate an invite email after you finish setup. They&apos;ll join as staff — you can adjust roles
          from Members.
        </p>
      </div>

      <ul className="grid gap-2">
        {invites.map((row, idx) => {
          const trimmed = row.email.trim();
          const invalid = trimmed.length > 0 && !isValidEmail(trimmed);
          return (
            <li key={idx} className="grid gap-1">
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  className="input flex-1"
                  value={row.email}
                  onChange={(e) => updateEmail(idx, e.target.value)}
                  placeholder="teammate@museum.org"
                  autoComplete="email"
                />
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  className="btn-secondary"
                >
                  Remove
                </button>
              </div>
              {invalid ? (
                <span className="text-xs text-red-700">Invalid email</span>
              ) : null}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={addRow}
        className="btn-secondary w-full border-dashed"
      >
        + Add another
      </button>

      <p className="text-xs text-paper-500">
        Leave this empty if you&apos;re flying solo — you can invite people later from Settings → Members.
      </p>
    </div>
  );
}
