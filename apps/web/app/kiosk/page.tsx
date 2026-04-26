'use client';
import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
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
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLDivElement>(null);

  const loadConfig = useCallback(async () => {
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
  }, [qrToken]);

  useEffect(() => {
    if (!qrToken) {
      setError('Missing kiosk token.');
      return;
    }
    void loadConfig();
    const t = setInterval(loadConfig, 8 * 60 * 1000);
    return () => clearInterval(t);
  }, [qrToken, loadConfig]);

  useEffect(() => {
    if (successCountdown === null) return;
    if (successCountdown === 0) {
      setSuccessCountdown(null);
      setValues({});
      // Move focus to first form field after reset
      requestAnimationFrame(() => {
        const first = formRef.current?.querySelector<HTMLElement>('input, select');
        first?.focus();
      });
      return;
    }
    const t = setTimeout(() => setSuccessCountdown((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(t);
  }, [successCountdown]);

  // Focus the success heading when it appears
  useEffect(() => {
    if (successCountdown !== null && successRef.current) {
      successRef.current.focus();
    }
  }, [successCountdown !== null]); // eslint-disable-line react-hooks/exhaustive-deps

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
    return (
      <main className="flex min-h-screen items-center justify-center p-8 text-center text-lg text-red-700" role="alert">
        {error}
      </main>
    );
  }

  if (!config) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8 text-lg text-slate-500" role="status" aria-label="Loading kiosk">
        Loading kiosk…
      </main>
    );
  }

  if (successCountdown !== null) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-emerald-50 p-8 text-center">
        <div
          ref={successRef}
          tabIndex={-1}
          className="text-5xl font-semibold text-emerald-700 outline-none"
          role="status"
          aria-live="polite"
        >
          Welcome!
        </div>
        <p className="mt-4 text-lg text-slate-700">Please head inside. The kiosk resets in…</p>
        <div
          className="mt-6 text-6xl font-bold tabular-nums text-emerald-700"
          aria-live="polite"
          aria-atomic="true"
          aria-label={`${successCountdown} seconds remaining`}
        >
          {successCountdown}s
        </div>
        <button
          type="button"
          onClick={() => setSuccessCountdown(0)}
          className="btn mt-6 min-h-[48px] min-w-[200px] px-8 py-3 text-lg"
        >
          New visitor
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center p-8">
      <div className="text-sm text-slate-500">{config.orgName}</div>
      <h1 className="text-3xl font-semibold tracking-tight">Welcome. Please check in.</h1>
      <p className="mt-1 text-slate-600">{config.locationName}</p>
      <form ref={formRef} onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        {fields.map((f) => (
          <div key={f.fieldKey}>
            {f.fieldType === 'checkbox' ? (
              <label className="flex min-h-[48px] items-center gap-3">
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded border-slate-300"
                  checked={Boolean(values[f.fieldKey])}
                  onChange={(e) => setValues((v) => ({ ...v, [f.fieldKey]: e.target.checked }))}
                  aria-required={f.required || undefined}
                />
                <span className="text-sm font-medium">{f.label}{f.required ? ' *' : ''}</span>
              </label>
            ) : (
              <label className="block">
                <span className="text-sm font-medium">{f.label}{f.required ? ' *' : ''}</span>
                {f.fieldType === 'text' ? (
                  <input
                    type="text"
                    required={f.required}
                    aria-required={f.required || undefined}
                    className="input mt-1 min-h-[48px]"
                    value={(values[f.fieldKey] as string) ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [f.fieldKey]: e.target.value }))}
                    maxLength={f.validation?.maxLength}
                    autoComplete={f.fieldKey === 'email' ? 'email' : f.fieldKey === 'name' ? 'name' : f.fieldKey === 'phone' ? 'tel' : undefined}
                  />
                ) : f.fieldType === 'number' ? (
                  <input
                    type="number"
                    required={f.required}
                    aria-required={f.required || undefined}
                    className="input mt-1 min-h-[48px]"
                    value={(values[f.fieldKey] as number) ?? ''}
                    min={f.validation?.min}
                    max={f.validation?.max}
                    onChange={(e) => setValues((v) => ({ ...v, [f.fieldKey]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                    inputMode="numeric"
                  />
                ) : f.fieldType === 'select' ? (
                  <select
                    required={f.required}
                    aria-required={f.required || undefined}
                    className="input mt-1 min-h-[48px]"
                    value={(values[f.fieldKey] as string) ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [f.fieldKey]: e.target.value }))}
                  >
                    <option value="">Select…</option>
                    {(f.options ?? []).map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : null}
              </label>
            )}
          </div>
        ))}
        {error ? (
          <p className="text-sm text-red-600" role="alert" aria-live="assertive">{error}</p>
        ) : null}
        <button
          type="submit"
          className="btn w-full min-h-[56px] py-3 text-lg"
          disabled={submitting}
          aria-busy={submitting || undefined}
        >
          {submitting ? 'Checking in…' : 'Check in'}
        </button>
      </form>
    </main>
  );
}

export default function KioskPage() {
  return (
    <Suspense fallback={
      <main className="flex min-h-screen items-center justify-center p-8 text-lg text-slate-500" role="status" aria-label="Loading kiosk">
        Loading kiosk…
      </main>
    }>
      <KioskInner />
    </Suspense>
  );
}
