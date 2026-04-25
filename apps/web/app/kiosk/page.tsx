'use client';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { API_BASE_URL } from '../../lib/env';

interface KioskConfig {
  data: {
    orgId: string;
    locationId: string;
    orgName: string;
    locationName: string;
    resetSeconds: number;
    nonce: string;
  };
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

function KioskInner() {
  const search = useSearchParams();
  const qrToken = search.get('token') ?? '';
  const [config, setConfig] = useState<KioskConfig['data'] | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [submitting, setSubmitting] = useState(false);
  const [successCountdown, setSuccessCountdown] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadConfig() {
    setError(null);
    try {
      const [c, f] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/kiosk/${qrToken}/config`).then((r) => r.json() as Promise<KioskConfig>),
        fetch(`${API_BASE_URL}/api/v1/kiosk/${qrToken}/form`).then((r) => r.json() as Promise<{ data: { fields: FormField[] } }>),
      ]);
      if (!c.data || !f.data) throw new Error('bad response');
      setConfig(c.data);
      setFields(f.data.fields.sort((a, b) => a.displayOrder - b.displayOrder));
      setValues({});
    } catch {
      setError('Kiosk configuration unavailable. Check the QR token.');
    }
  }

  useEffect(() => {
    if (!qrToken) {
      setError('Missing kiosk token.');
      return;
    }
    void loadConfig();
    // Refresh the nonce every 8 minutes (TTL is 10).
    const t = setInterval(loadConfig, 8 * 60 * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrToken]);

  useEffect(() => {
    if (successCountdown === null) return;
    if (successCountdown === 0) {
      setSuccessCountdown(null);
      setValues({});
      return;
    }
    const t = setTimeout(() => setSuccessCountdown((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(t);
  }, [successCountdown]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!config) return;
    setSubmitting(true);
    setError(null);
    try {
      const idem = uuidv4();
      const body = {
        formResponse: Object.fromEntries(
          fields.map((f) => {
            const v = values[f.fieldKey];
            if (f.fieldType === 'number') return [f.fieldKey, typeof v === 'number' ? v : Number(v)];
            if (f.fieldType === 'checkbox') return [f.fieldKey, Boolean(v)];
            return [f.fieldKey, v ?? ''];
          }),
        ),
      };
      const res = await fetch(`${API_BASE_URL}/api/v1/kiosk/${qrToken}/checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Kiosk-Nonce': config.nonce,
          'Idempotency-Key': idem,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const problem = await res.json().catch(() => null);
        throw new Error(problem?.detail ?? problem?.title ?? 'Check-in failed');
      }
      setSuccessCountdown(config.resetSeconds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !config) {
    return <main className="flex min-h-screen items-center justify-center p-8 text-center text-lg text-red-700">{error}</main>;
  }

  if (!config) {
    return <main className="flex min-h-screen items-center justify-center p-8 text-lg text-slate-500">Loading kiosk…</main>;
  }

  if (successCountdown !== null) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-emerald-50 p-8 text-center">
        <div className="text-5xl font-semibold text-emerald-700">Welcome!</div>
        <p className="mt-4 text-lg text-slate-700">Please head inside. The kiosk resets in…</p>
        <div className="mt-6 text-6xl font-bold tabular-nums text-emerald-700">{successCountdown}s</div>
        <button onClick={() => setSuccessCountdown(0)} className="btn mt-6">New visitor</button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center p-8">
      <div className="text-sm text-slate-500">{config.orgName}</div>
      <h1 className="text-3xl font-semibold tracking-tight">Welcome. Please check in.</h1>
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
                onChange={(e) => setValues((v) => ({ ...v, [f.fieldKey]: e.target.value === '' ? undefined : Number(e.target.value) }))}
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

export default function KioskPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center p-8 text-lg text-slate-500">Loading kiosk…</main>}>
      <KioskInner />
    </Suspense>
  );
}
