'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { apiPatch, ApiError } from '../../../lib/api';
import { useSession } from '../../../lib/session';
import { PALETTES, type Palette } from '../../../lib/palettes';
import { useBrandingQuery, type BrandingFont, type BrandingRadius } from '../../../lib/branding';

type FontFamily = BrandingFont;
type ButtonRadius = BrandingRadius;

const RADIUS_PX: Record<ButtonRadius, string> = {
  none: '0',
  small: '4px',
  medium: '8px',
  large: '14px',
  full: '9999px',
};

const FONT_STACK: Record<FontFamily, string> = {
  system: 'ui-sans-serif, system-ui, sans-serif',
  sans: 'Inter, ui-sans-serif, system-ui, sans-serif',
  serif: 'Fraunces, ui-serif, Georgia, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function matchesPalette(p: Palette, primary: string, secondary: string, accent: string): boolean {
  return (
    normalize(p.primary) === normalize(primary) &&
    normalize(p.secondary) === normalize(secondary) &&
    normalize(p.accent) === normalize(accent)
  );
}

function Swatch({ color }: { color: string }) {
  return <span className="inline-block h-7 w-3 rounded-sm border border-black/5" style={{ backgroundColor: color }} />;
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  // Native <input type="color"> requires a 7-char #rrggbb. Fall back to black
  // for the picker widget when the text field is empty or invalid.
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000';
  return (
    <div>
      <label className="h-eyebrow">{label}</label>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          className="h-9 w-9 cursor-pointer rounded border border-paper-200 bg-white p-0.5"
          value={safe}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} color picker`}
        />
        <input
          type="text"
          className="input font-mono"
          placeholder="#000000"
          pattern="#[0-9a-fA-F]{6}"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

export default function BrandingPage() {
  const { activeOrgId } = useSession();
  const branding = useBrandingQuery(activeOrgId);
  const [logoUrl, setLogoUrl] = useState('');
  const [primary, setPrimary] = useState('');
  const [secondary, setSecondary] = useState('');
  const [accent, setAccent] = useState('');
  const [fontFamily, setFontFamily] = useState<FontFamily>('system');
  const [radius, setRadius] = useState<ButtonRadius>('medium');
  const [customOpen, setCustomOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const b = branding.data;
    if (!b) return;
    setLogoUrl(b.data.logoUrl ?? '');
    setPrimary(b.data.theme.primaryColor ?? '');
    setSecondary(b.data.theme.secondaryColor ?? '');
    setAccent(b.data.theme.accentColor ?? '');
    setFontFamily(b.data.theme.fontFamily ?? 'system');
    setRadius(b.data.theme.buttonRadius ?? 'medium');
  }, [branding.data]);

  const selectedPalette = useMemo(() => {
    if (!primary || !secondary || !accent) return null;
    return PALETTES.find((p) => matchesPalette(p, primary, secondary, accent)) ?? null;
  }, [primary, secondary, accent]);

  const applyPalette = (p: Palette) => {
    setPrimary(p.primary);
    setSecondary(p.secondary);
    setAccent(p.accent);
    setCustomOpen(false);
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null); setErr(null); setSaving(true);
    const theme: Record<string, string> = { fontFamily, buttonRadius: radius };
    if (primary) theme.primaryColor = primary;
    if (secondary) theme.secondaryColor = secondary;
    if (accent) theme.accentColor = accent;
    try {
      await apiPatch(`/api/v1/orgs/${activeOrgId}/branding`, {
        logoUrl: logoUrl || null,
        theme,
      });
      setMsg('Saved.');
      setTimeout(() => setMsg(null), 2500);
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.problem.detail ?? e2.problem.title : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const previewPrimary = primary || '#1a1714';
  const previewAccent = accent || '#b0573d';
  const previewRadius = RADIUS_PX[radius];
  const previewFont = FONT_STACK[fontFamily];

  return (
    <form onSubmit={onSubmit}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-eyebrow">Settings</div>
          <h1 className="h-display mt-1">Branding</h1>
          <p className="mt-2 max-w-xl text-sm text-paper-600">
            Colors, logo, and typography used on your kiosk and public booking pages.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {msg ? <span className="text-sm text-accent-700">{msg}</span> : null}
          {err ? <span className="text-sm text-red-700">{err}</span> : null}
          <button type="submit" disabled={saving} className="btn">{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-8">
          <section>
            <h2 className="h-eyebrow">Logo</h2>
            <input
              className="input mt-2"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://…"
            />
            <p className="mt-1 text-xs text-paper-500">Paste a URL to an image. Transparent backgrounds work best.</p>
          </section>

          <section>
            <h2 className="h-eyebrow">Color palette</h2>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {PALETTES.map((p) => {
                const isSelected = selectedPalette?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPalette(p)}
                    className={`group flex items-center gap-3 rounded-md border p-3 text-left transition ${
                      isSelected
                        ? 'border-ink bg-paper-50'
                        : 'border-paper-200 bg-white hover:border-paper-400'
                    }`}
                  >
                    <div className="flex gap-1">
                      <Swatch color={p.primary} />
                      <Swatch color={p.secondary} />
                      <Swatch color={p.accent} />
                    </div>
                    <span className="text-sm">{p.name}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setCustomOpen((o) => !o)}
                className={`flex items-center justify-center rounded-md border p-3 text-sm text-paper-600 transition hover:text-ink ${
                  customOpen || (primary && !selectedPalette)
                    ? 'border-ink bg-paper-50'
                    : 'border-dashed border-paper-300'
                }`}
              >
                + Custom
              </button>
            </div>

            {(customOpen || (primary && !selectedPalette)) ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <ColorField label="Primary" value={primary} onChange={setPrimary} />
                <ColorField label="Secondary" value={secondary} onChange={setSecondary} />
                <ColorField label="Accent" value={accent} onChange={setAccent} />
              </div>
            ) : null}
          </section>

          <section>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h2 className="h-eyebrow">Typography</h2>
                <select
                  className="input mt-2"
                  value={fontFamily}
                  onChange={(e) => setFontFamily(e.target.value as FontFamily)}
                >
                  <option value="system">System</option>
                  <option value="sans">Sans (Inter)</option>
                  <option value="serif">Serif (Fraunces)</option>
                  <option value="mono">Monospace</option>
                </select>
              </div>
              <div>
                <h2 className="h-eyebrow">Button radius</h2>
                <select
                  className="input mt-2"
                  value={radius}
                  onChange={(e) => setRadius(e.target.value as ButtonRadius)}
                >
                  <option value="none">None</option>
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                  <option value="full">Full</option>
                </select>
              </div>
            </div>
          </section>
        </div>

        {/* Preview */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <h2 className="h-eyebrow mb-2">Preview</h2>
          <div
            className="rounded-md border border-paper-200 bg-white p-6"
            style={{ fontFamily: previewFont }}
          >
            <div className="mb-5 flex items-center gap-3">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="h-8 w-auto" />
              ) : (
                <div
                  className="flex h-8 w-8 items-center justify-center rounded"
                  style={{ backgroundColor: previewPrimary }}
                >
                  <span className="text-sm font-semibold text-white">M</span>
                </div>
              )}
              <span className="text-sm text-paper-500">Your museum</span>
            </div>

            <div className="text-xl font-medium" style={{ color: previewPrimary }}>
              Welcome.
            </div>
            <p className="mt-1 text-sm" style={{ color: secondary || '#5d564b' }}>
              Tell us a bit about your visit today.
            </p>

            <div className="mt-4 space-y-2">
              <div className="rounded-md border border-paper-200 bg-paper-50/50 px-3 py-2 text-sm text-paper-500">Name</div>
              <div className="rounded-md border border-paper-200 bg-paper-50/50 px-3 py-2 text-sm text-paper-500">Party size</div>
            </div>

            <button
              type="button"
              tabIndex={-1}
              className="mt-4 px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: previewAccent, borderRadius: previewRadius }}
            >
              Check in
            </button>

            <div className="mt-6 border-t border-paper-200 pt-4">
              <div className="flex items-center justify-between text-xs text-paper-500">
                <span>Colors</span>
                <div className="flex gap-1">
                  <Swatch color={primary || '#1a1714'} />
                  <Swatch color={secondary || '#8b8376'} />
                  <Swatch color={accent || '#b0573d'} />
                </div>
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-paper-500">
            This is a rough preview — the live kiosk applies these values.
          </p>
        </aside>
      </div>
    </form>
  );
}
