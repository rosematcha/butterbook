'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import type { FormField } from '@butterbook/shared';
import { API_BASE_URL, IS_DEMO, MARKETING_URL } from '../../lib/env';
import { FormRenderer } from '../components/form-renderer';

interface BookConfig {
  org: { id: string; name: string; timezone: string; logoUrl: string | null; theme: unknown };
  location: { id: string; name: string; address: string | null; city: string | null; state: string | null; zip: string | null };
  page: {
    heroTitle: string | null;
    heroSubtitle: string | null;
    heroImageUrl: string | null;
    introMarkdown: string | null;
    confirmationMarkdown: string | null;
    confirmationRedirectUrl: string | null;
    leadTimeMinHours: number;
    bookingWindowDays: number;
    maxPartySize: number | null;
    intakeSchedules: boolean;
  };
  policy: { cancelCutoffHours: number; refundPolicyText: string | null } | null;
  fields: FormField[];
}

interface Slot {
  start: string;
  time: string;
  available: boolean;
}

interface MonthDay {
  date: string;
  open: boolean;
  closed: boolean;
  reason?: string;
  bookable: boolean;
}

function uuidv4(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function monthLabel(d: Date): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(d);
}

interface InnerProps {
  embed?: boolean;
}

export function BookInner({ embed = false }: InnerProps) {
  const search = useSearchParams();
  const slug = search.get('org') ?? '';
  const locId = search.get('loc') ?? '';
  const urlEmbed = search.get('embed') === '1';
  const isEmbed = embed || urlEmbed;

  const [config, setConfig] = useState<BookConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [viewMonth, setViewMonth] = useState<Date>(startOfMonth(new Date()));
  const [monthDays, setMonthDays] = useState<Record<string, MonthDay> | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [redirectSecondsLeft, setRedirectSecondsLeft] = useState<number | null>(null);
  const [redirectCancelled, setRedirectCancelled] = useState(false);

  useEffect(() => {
    if (IS_DEMO) window.location.replace(MARKETING_URL);
  }, []);

  useEffect(() => {
    if (!slug || !locId || IS_DEMO) {
      if (!slug || !locId) setError('This booking link is incomplete.');
      return;
    }
    fetch(`${API_BASE_URL}/api/v1/public/${encodeURIComponent(slug)}/book/${locId}/config`)
      .then((r) => (r.ok ? (r.json() as Promise<{ data: BookConfig }>) : Promise.reject(new Error('Not found'))))
      .then((c) => setConfig(c.data))
      .catch(() => setError('This booking page is not available.'));
  }, [slug, locId]);

  // Load month availability whenever the visible month changes.
  useEffect(() => {
    if (!config) return;
    const y = viewMonth.getFullYear();
    const m = viewMonth.getMonth() + 1;
    fetch(
      `${API_BASE_URL}/api/v1/public/${encodeURIComponent(slug)}/book/${locId}/availability/month?year=${y}&month=${m}`,
    )
      .then((r) => (r.ok ? (r.json() as Promise<{ data: { days: MonthDay[] } }>) : Promise.reject(new Error('failed'))))
      .then((b) => {
        const byDate: Record<string, MonthDay> = {};
        for (const d of b.data.days) byDate[d.date] = d;
        setMonthDays(byDate);
      })
      .catch(() => setMonthDays({}));
  }, [config, viewMonth, slug, locId]);

  async function loadSlots(date: string) {
    setSlotsLoading(true);
    setSlots(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/public/${encodeURIComponent(slug)}/book/${locId}/availability?date=${date}`,
      );
      if (!res.ok) throw new Error('failed');
      const body = (await res.json()) as { data: { open: boolean; slots: Slot[] } };
      setSlots(body.data.slots);
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }

  function pickDate(date: string) {
    setSelectedDate(date);
    void loadSlots(date);
  }

  function pickSlot(slot: Slot) {
    setSelectedSlot(slot);
    setStep(2);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!config || !selectedSlot) return;
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const body = {
        scheduledAt: selectedSlot.start,
        formResponse: Object.fromEntries(
          config.fields.map((fld) => {
            const v = values[fld.fieldKey];
            if (fld.fieldType === 'number') {
              if (v === '' || v == null) return [fld.fieldKey, undefined];
              return [fld.fieldKey, typeof v === 'number' ? v : Number(v)];
            }
            if (fld.fieldType === 'checkbox') return [fld.fieldKey, Boolean(v)];
            return [fld.fieldKey, v ?? ''];
          }),
        ),
      };
      const res = await fetch(`${API_BASE_URL}/api/v1/public/${encodeURIComponent(slug)}/book/${locId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': uuidv4(),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const problem = (await res.json().catch(() => null)) as
          | { detail?: string; title?: string; errors?: Record<string, string> }
          | null;
        if (problem?.errors && typeof problem.errors === 'object') {
          setFieldErrors(problem.errors);
        }
        throw new Error(problem?.detail ?? problem?.title ?? 'Booking failed.');
      }
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed.');
    } finally {
      setSubmitting(false);
    }
  }

  // Auto-redirect on confirmation if admin set a URL.
  useEffect(() => {
    if (step !== 3 || !config?.page.confirmationRedirectUrl || redirectCancelled) return;
    setRedirectSecondsLeft(8);
    const t = setInterval(() => {
      setRedirectSecondsLeft((s) => {
        if (s == null) return null;
        if (s <= 1) {
          clearInterval(t);
          if (!redirectCancelled && config.page.confirmationRedirectUrl) {
            window.location.href = config.page.confirmationRedirectUrl;
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [step, config?.page.confirmationRedirectUrl, redirectCancelled]);

  // postMessage resize for embed consumers.
  useEffect(() => {
    if (!isEmbed || typeof window === 'undefined') return;
    const post = () => {
      const h = document.documentElement.scrollHeight;
      window.parent?.postMessage({ type: 'butterbook:resize', height: h }, '*');
    };
    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [isEmbed, step, config, slots]);

  const containerClass = isEmbed
    ? 'mx-auto max-w-2xl px-6 py-6'
    : 'mx-auto min-h-screen max-w-2xl px-6 py-12';

  if (error && !config) {
    return (
      <main className={containerClass + ' flex items-center justify-center text-center'}>
        <div className="text-lg text-red-700">{error}</div>
      </main>
    );
  }
  if (!config) {
    return <main className={containerClass + ' text-center text-paper-500'}>Loading…</main>;
  }

  const hero = (
    <header>
      {config.page.heroImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={config.page.heroImageUrl}
          alt=""
          className="mb-6 h-40 w-full rounded-md object-cover sm:h-56"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : null}
      <div className="h-eyebrow text-paper-500">{config.org.name}</div>
      <h1 className="h-display mt-1">{config.page.heroTitle ?? 'Book your visit'}</h1>
      {config.page.heroSubtitle ? (
        <p className="mt-2 text-paper-700">{config.page.heroSubtitle}</p>
      ) : null}
      {config.page.introMarkdown ? (
        <p className="mt-4 whitespace-pre-line text-sm text-paper-700">{config.page.introMarkdown}</p>
      ) : null}
    </header>
  );

  const stepper = (
    <div className="mt-6 flex items-center gap-4 text-xs">
      <span className={step === 1 ? 'h-eyebrow text-ink' : 'h-eyebrow text-paper-400'}>1 Pick a time</span>
      <span className="text-paper-300">·</span>
      <span className={step === 2 ? 'h-eyebrow text-ink' : 'h-eyebrow text-paper-400'}>2 Your details</span>
      <span className="text-paper-300">·</span>
      <span className={step === 3 ? 'h-eyebrow text-ink' : 'h-eyebrow text-paper-400'}>3 Confirmed</span>
    </div>
  );

  return (
    <main className={containerClass}>
      {hero}
      {stepper}

      {step === 1 ? (
        <section className="mt-6">
          <CalendarGrid
            viewMonth={viewMonth}
            monthDays={monthDays}
            selectedDate={selectedDate}
            onPrev={() => {
              setViewMonth(addMonths(viewMonth, -1));
              setSelectedDate(null);
              setSlots(null);
            }}
            onNext={() => {
              setViewMonth(addMonths(viewMonth, 1));
              setSelectedDate(null);
              setSlots(null);
            }}
            onPickDate={pickDate}
          />

          {selectedDate ? (
            <div className="panel mt-4 p-4">
              <div className="h-eyebrow">Slots for {formatDateLabel(selectedDate)}</div>
              {slotsLoading ? (
                <div className="mt-3 text-sm text-paper-500">Loading slots…</div>
              ) : slots && slots.filter((s) => s.available).length === 0 ? (
                <div className="mt-3 text-sm text-paper-500">No slots available that day.</div>
              ) : slots ? (
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.map((s) => (
                    <button
                      key={s.start}
                      type="button"
                      disabled={!s.available}
                      className="btn-ghost py-2 text-sm disabled:opacity-40"
                      onClick={() => pickSlot(s)}
                    >
                      {new Intl.DateTimeFormat('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        timeZone: config.org.timezone,
                      }).format(new Date(s.start))}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-paper-500">Select a date to see available times.</p>
          )}

          {config.policy?.refundPolicyText ? (
            <div className="mt-6 rounded-md border border-paper-200 bg-paper-50 p-4 text-sm text-paper-700">
              <div className="h-eyebrow mb-1">Cancellation policy</div>
              {config.policy.refundPolicyText}
            </div>
          ) : null}
        </section>
      ) : null}

      {step === 2 && selectedSlot ? (
        <section className="mt-6">
          <div className="panel mb-4 flex items-center justify-between p-4">
            <div>
              <div className="h-eyebrow">Your time</div>
              <div className="mt-1 text-base">
                {new Intl.DateTimeFormat('en-US', {
                  dateStyle: 'full',
                  timeStyle: 'short',
                  timeZone: config.org.timezone,
                }).format(new Date(selectedSlot.start))}
              </div>
            </div>
            <button
              type="button"
              className="link text-sm"
              onClick={() => {
                setStep(1);
                setSelectedSlot(null);
              }}
            >
              Change time
            </button>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <FormRenderer
              fields={config.fields}
              values={values}
              onChange={(k, v) => setValues((prev) => ({ ...prev, [k]: v }))}
              errors={fieldErrors}
            />
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            <button className="btn w-full py-3 text-base" disabled={submitting}>
              {submitting ? 'Booking…' : 'Confirm booking'}
            </button>
          </form>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="mt-8">
          <div className="panel p-6">
            <div className="text-2xl font-semibold text-accent-700">You&apos;re booked.</div>
            {config.page.confirmationMarkdown ? (
              <p className="mt-3 whitespace-pre-line text-paper-700">{config.page.confirmationMarkdown}</p>
            ) : (
              <p className="mt-3 text-paper-700">
                Thanks! We&apos;ll see you on{' '}
                {selectedSlot
                  ? new Intl.DateTimeFormat('en-US', {
                      dateStyle: 'long',
                      timeStyle: 'short',
                      timeZone: config.org.timezone,
                    }).format(new Date(selectedSlot.start))
                  : 'your scheduled date'}
                .
              </p>
            )}
            <p className="mt-4 text-xs text-paper-500">
              We&apos;ll email you a confirmation with a link to add this to your calendar.
            </p>
          </div>

          {config.page.confirmationRedirectUrl && redirectSecondsLeft != null && !redirectCancelled ? (
            <p className="mt-4 text-sm text-paper-500">
              Forwarding you in {redirectSecondsLeft}s…{' '}
              <button
                type="button"
                className="link"
                onClick={() => {
                  setRedirectCancelled(true);
                  setRedirectSecondsLeft(null);
                }}
              >
                Stay here
              </button>
            </p>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}

function formatDateLabel(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).format(dt);
}

function CalendarGrid({
  viewMonth,
  monthDays,
  selectedDate,
  onPrev,
  onNext,
  onPickDate,
}: {
  viewMonth: Date;
  monthDays: Record<string, MonthDay> | null;
  selectedDate: string | null;
  onPrev: () => void;
  onNext: () => void;
  onPickDate: (d: string) => void;
}) {
  const daysInMonth = useMemo(() => {
    return new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  }, [viewMonth]);
  const firstWeekday = viewMonth.getDay(); // 0..6, Sun..Sat
  const todayYmd = ymd(new Date());

  const cells: Array<{ key: string; date: string | null }> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ key: `pad-${i}`, date: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ key: date, date });
  }

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <button type="button" className="btn-ghost px-3 py-1 text-sm" onClick={onPrev}>
          ←
        </button>
        <div className="text-sm font-medium">{monthLabel(viewMonth)}</div>
        <button type="button" className="btn-ghost px-3 py-1 text-sm" onClick={onNext}>
          →
        </button>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-paper-500">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map(({ key, date }) => {
          if (!date) return <div key={key} />;
          const info = monthDays?.[date];
          const isPast = date < todayYmd;
          const bookable = !isPast && (info?.bookable ?? false);
          const selected = selectedDate === date;
          return (
            <button
              key={key}
              type="button"
              disabled={!bookable}
              onClick={() => onPickDate(date)}
              className={
                'aspect-square rounded-md text-sm ' +
                (selected
                  ? 'bg-brand-primary text-white'
                  : bookable
                  ? 'bg-white text-ink hover:bg-paper-100 border border-paper-200'
                  : 'text-paper-300')
              }
            >
              {Number(date.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
