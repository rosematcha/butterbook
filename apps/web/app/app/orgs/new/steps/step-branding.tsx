'use client';
import type { StepProps } from '../types';
import { PALETTES, DEFAULT_ACCENT } from '../../../../../lib/palettes';

// Wizard only captures the accent hex. The primary/secondary pair stays at
// defaults until the user visits Branding settings.
const ACCENT_SWATCHES = PALETTES.map((p) => ({ hex: p.accent, label: p.name }));

export function StepBranding({ state, patch }: StepProps) {
  const selected = state.accentHex;
  const customValue =
    selected && !ACCENT_SWATCHES.some((s) => s.hex.toLowerCase() === selected.toLowerCase())
      ? selected
      : '';

  return (
    <div className="grid gap-7">
      <section>
        <label className="block">
          <span className="h-eyebrow">Logo</span>
          <input
            className="input mt-2"
            value={state.logoUrl}
            onChange={(e) => patch({ logoUrl: e.target.value })}
            placeholder="https://…"
          />
          <span className="mt-1 block text-xs text-paper-500">
            Paste a URL to an image. Transparent backgrounds work best. You can upload later from Branding settings.
          </span>
        </label>
      </section>

      <fieldset>
        <legend className="h-eyebrow">Accent color</legend>
        <p className="mt-1 text-xs text-paper-500">
          Highlights on buttons, badges, and your public booking page.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {ACCENT_SWATCHES.map((s) => {
            const isSelected = selected?.toLowerCase() === s.hex.toLowerCase();
            return (
              <button
                key={s.hex}
                type="button"
                onClick={() => patch({ accentHex: s.hex })}
                aria-label={s.label}
                aria-pressed={isSelected}
                title={s.label}
                className={`h-10 w-10 rounded-full border-2 transition focus:outline-none focus:ring-2 focus:ring-brand-accent/40 ${
                  isSelected ? 'border-ink scale-110' : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: s.hex }}
              />
            );
          })}
          <label className="ml-1 flex items-center gap-2 rounded-md border border-dashed border-paper-300 px-3 py-1.5 text-xs text-paper-600">
            Custom
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(selected ?? '') ? (selected as string) : '#000000'}
              onChange={(e) => patch({ accentHex: e.target.value })}
              className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
            />
          </label>
          {selected ? (
            <button
              type="button"
              className="ml-1 text-xs text-paper-500 underline underline-offset-2 hover:text-ink"
              onClick={() => patch({ accentHex: null })}
            >
              Clear
            </button>
          ) : null}
        </div>
        {customValue ? (
          <div className="mt-2 text-xs text-paper-500">Custom: <span className="font-mono">{customValue}</span></div>
        ) : null}

        <div className="mt-5 flex items-center gap-3">
          <span className="text-xs text-paper-500">Preview:</span>
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium text-white"
            style={{ backgroundColor: selected ?? DEFAULT_ACCENT }}
          >
            Available
          </span>
          <button
            type="button"
            className="btn-accent"
            style={selected ? { backgroundColor: selected } : undefined}
          >
            Book a visit
          </button>
        </div>
      </fieldset>
    </div>
  );
}
