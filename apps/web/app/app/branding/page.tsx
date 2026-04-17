'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { apiGet, apiPatch, ApiError } from '../../../lib/api';
import { useSession } from '../../../lib/session';

interface Branding {
  data: {
    id: string;
    name: string;
    publicSlug: string;
    logoUrl: string | null;
    theme: {
      primaryColor?: string;
      secondaryColor?: string;
      accentColor?: string;
      fontFamily?: 'system' | 'serif' | 'sans' | 'mono';
      buttonRadius?: 'none' | 'small' | 'medium' | 'large' | 'full';
    };
  };
}

export default function BrandingPage() {
  const { activeOrgId } = useSession();
  const [logoUrl, setLogoUrl] = useState('');
  const [primary, setPrimary] = useState('');
  const [accent, setAccent] = useState('');
  const [fontFamily, setFontFamily] = useState<'system' | 'serif' | 'sans' | 'mono'>('system');
  const [radius, setRadius] = useState<'none' | 'small' | 'medium' | 'large' | 'full'>('medium');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!activeOrgId) return;
    apiGet<Branding>(`/api/v1/orgs/${activeOrgId}/branding`).then((b) => {
      setLogoUrl(b.data.logoUrl ?? '');
      setPrimary(b.data.theme.primaryColor ?? '');
      setAccent(b.data.theme.accentColor ?? '');
      setFontFamily(b.data.theme.fontFamily ?? 'system');
      setRadius(b.data.theme.buttonRadius ?? 'medium');
    });
  }, [activeOrgId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null); setErr(null);
    const theme: Record<string, string> = { fontFamily, buttonRadius: radius };
    if (primary) theme.primaryColor = primary;
    if (accent) theme.accentColor = accent;
    try {
      await apiPatch(`/api/v1/orgs/${activeOrgId}/branding`, {
        logoUrl: logoUrl || null,
        theme,
      });
      setMsg('Saved.');
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.problem.detail ?? e2.problem.title : 'Save failed');
    }
  }

  return (
    <form onSubmit={onSubmit} className="card max-w-lg space-y-4">
      <h2 className="text-lg font-semibold">Branding</h2>
      <label className="block">
        <span className="text-sm font-medium">Logo URL</span>
        <input className="input mt-1" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Primary color (hex)</span>
        <input className="input mt-1" pattern="#[0-9a-fA-F]{6}" value={primary} onChange={(e) => setPrimary(e.target.value)} placeholder="#0f172a" />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Accent color (hex)</span>
        <input className="input mt-1" pattern="#[0-9a-fA-F]{6}" value={accent} onChange={(e) => setAccent(e.target.value)} placeholder="#2563eb" />
      </label>
      <label className="block">
        <span className="text-sm font-medium">Font family</span>
        <select className="input mt-1" value={fontFamily} onChange={(e) => setFontFamily(e.target.value as typeof fontFamily)}>
          <option value="system">System</option>
          <option value="serif">Serif</option>
          <option value="sans">Sans</option>
          <option value="mono">Mono</option>
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-medium">Button radius</span>
        <select className="input mt-1" value={radius} onChange={(e) => setRadius(e.target.value as typeof radius)}>
          <option value="none">None</option>
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
          <option value="full">Full</option>
        </select>
      </label>
      {msg ? <p className="text-sm text-green-700">{msg}</p> : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
      <button className="btn">Save</button>
    </form>
  );
}
