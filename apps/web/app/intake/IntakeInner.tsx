'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { API_BASE_URL, IS_DEMO, MARKETING_URL } from '../../lib/env';

interface IntakeConfig {
  orgId: string;
  locationId: string;
  orgName: string;
  locationName: string;
  resetSeconds: number;
  intakeSchedules?: boolean;
  nonce: string;
}

interface FormField {
  fieldKey: string;
  label: string;
  fieldType: 'text' | 'number' | 'select' | 'checkbox';
  required: boolean;
  isSystem: boolean;
  displayOrder: number;
  options?: string[];
  validation?: { minLength?: number; maxLength?: number; min?: number; max?: number };
}

type FieldValue = string | number | boolean | undefined;

function uuidv4(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface InnerProps {
  embed?: boolean;
}

export function IntakeInner({ embed = false }: InnerProps) {
  const search = useSearchParams();
  const slug = search.get('org') ?? '';
  const [config, setConfig] = useState<IntakeConfig | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null = chooser screen (before user picks walk-in vs scheduled)
  const [mode, setMode] = useState<'walkin' | null>(null);

  useEffect(() => {
    if (IS_DEMO) window.location.replace(MARKETING_URL);
  }, []);

  async function loadConfig() {
    setError(null);
    try {
      const [c, f] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/public/intake/${slug}/config`).then((r) =>
          r.ok ? (r.json() as Promise<{ data: IntakeConfig }>) : Promise.reject(new Error('not found')),
        ),
        fetch(`${API_BASE_URL}/api/v1/public/intake/${slug}/form`).then((r) =>
          r.ok ? (r.json() as Promise<{ data: { fields: FormField[] } }>) : Promise.reject(new Error('not found')),
        ),
      ]);
      setConfig(c.data);
      setFields(f.data.fields.slice().sort((a, b) => a.displayOrder - b.displayOrder));
    } catch {
      setError('This intake page is not available.');
    }
  }

  useEffect(() => {
    if (!slug || IS_DEMO) {
      if (!slug) setError('Missing organization.');
      return;
    }
    void loadConfig();
    const t = setInterval(loadConfig, 8 * 60 * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // postMessage resize for embed consumers.
  useEffect(() => {
    if (!embed) return;
    if (typeof window === 'undefined') return;
    const post = () => {
      const h = document.documentElement.scrollHeight;
      window.parent?.postMessage({ type: 'butterbook:resize', height: h }, '*');
    };
    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [embed, config, submitted, error]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!config) return;
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        formResponse: Object.fromEntries(
          fields.map((fld) => {
            const v = values[fld.fieldKey];
            if (fld.fieldType === 'number') return [fld.fieldKey, typeof v === 'number' ? v : Number(v)];
            if (fld.fieldType === 'checkbox') return [fld.fieldKey, Boolean(v)];
            return [fld.fieldKey, v ?? ''];
          }),
        ),
      };
      const res = await fetch(`${API_BASE_URL}/api/v1/public/intake/${slug}/checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kiosk-Nonce': config.nonce,
          'Idempotency-Key': uuidv4(),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const problem = await res.json().catch(() => null);
        throw new Error(problem?.detail ?? problem?.title ?? 'Check-in failed');
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  const containerClass = embed
    ? 'mx-auto max-w-xl p-6'
    : 'mx-auto flex min-h-screen max-w-xl flex-col justify-center p-8';

  if (error && !config) {
    return <main className={containerClass + ' text-center text-lg text-red-700'}>{error}</main>;
  }

  if (!config) {
    return <main className={containerClass + ' text-center text-lg text-slate-500'}>Loading…</main>;
  }

  // When the org has opted into the scheduling path, show a chooser first.
  const showChooser = (config.intakeSchedules ?? false) && mode === null && !submitted;
  if (showChooser) {
    const bookHref = `/book?org=${encodeURIComponent(slug)}&loc=${config.locationId}${embed ? '&embed=1' : ''}`;
    return (
      <main className={containerClass}>
        <div className="text-sm text-slate-500">{config.orgName}</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Welcome</h1>
        <p className="mt-1 text-slate-600">{config.locationName}</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <button type="button" className="btn py-6 text-lg" onClick={() => setMode('walkin')}>
            Walk in now
          </button>
          <a className="btn-secondary py-6 text-center text-lg" href={bookHref}>
            Schedule a visit
          </a>
        </div>
        <p className="mt-6 text-xs text-slate-500">
          Walk in now to check in for today. Schedule a visit to pick a future date and time.
        </p>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className={embed ? 'p-6 text-center' : 'flex min-h-screen flex-col items-center justify-center bg-emerald-50 p-8 text-center'}>
        <div className="text-3xl font-semibold text-emerald-700">Thank you!</div>
        <p className="mt-3 text-slate-700">Your check-in has been received.</p>
        <button
          onClick={() => {
            setSubmitted(false);
            setValues({});
            if (config.intakeSchedules) setMode(null);
          }}
          className="btn mt-6"
        >
          Submit another
        </button>
      </main>
    );
  }

  return (
    <main className={containerClass}>
      <div className="text-sm text-slate-500">{config.orgName}</div>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Welcome. Please check in.</h1>
      <p className="mt-1 text-slate-600">{config.locationName}</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {fields.map((f) => (
          <label key={f.fieldKey} className="block">
            <span className="text-sm font-medium">{f.label}{f.required ? ' *' : ''}</span>
            {f.fieldType === 'text' ? (
              <input
                type="text"
                required={f.required}
                className="input mt-1"
                value={(values[f.fieldKey] as string) ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.fieldKey]: e.target.value }))}
                maxLength={f.validation?.maxLength}
              />
            ) : f.fieldType === 'number' ? (
              <input
                type="number"
                required={f.required}
                className="input mt-1"
                value={(values[f.fieldKey] as number) ?? ''}
                min={f.validation?.min}
                max={f.validation?.max}
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    [f.fieldKey]: e.target.value === '' ? undefined : Number(e.target.value),
                  }))
                }
              />
            ) : f.fieldType === 'select' ? (
              <select
                required={f.required}
                className="input mt-1"
                value={(values[f.fieldKey] as string) ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f.fieldKey]: e.target.value }))}
              >
                <option value="">—</option>
                {(f.options ?? []).map((o) => <option key={o}>{o}</option>)}
              </select>
            ) : f.fieldType === 'checkbox' ? (
              <input
                type="checkbox"
                className="mt-2"
                checked={Boolean(values[f.fieldKey])}
                onChange={(e) => setValues((v) => ({ ...v, [f.fieldKey]: e.target.checked }))}
              />
            ) : null}
          </label>
        ))}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button className="btn w-full py-3 text-lg" disabled={submitting}>
          {submitting ? 'Checking in…' : 'Check in'}
        </button>
      </form>
    </main>
  );
}
