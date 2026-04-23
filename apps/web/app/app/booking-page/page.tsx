'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, ApiError } from '../../../lib/api';
import { useSession } from '../../../lib/session';
import { API_BASE_URL } from '../../../lib/env';

interface BookingPageContent {
  heroTitle: string | null;
  heroSubtitle: string | null;
  heroImageUrl: string | null;
  introMarkdown: string | null;
  confirmationMarkdown: string | null;
  confirmationRedirectUrl: string | null;
  showPolicyOnPage: boolean;
  leadTimeMinHours: number;
  bookingWindowDays: number;
  maxPartySize: number | null;
  intakeSchedules: boolean;
}

interface LocationRow {
  id: string;
  name: string;
  isPrimary: boolean;
}

interface PolicyRow {
  refundPolicyText: string | null;
}

function normalizeUrl(raw: string | null): string | null {
  if (!raw) return null;
  const t = raw.trim();
  return t === '' ? null : t;
}

function bookingUrl(publicSlug: string | null, locId: string | null): string | null {
  if (!publicSlug || !locId) return null;
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://butterbook.app';
  return `${origin}/book?org=${encodeURIComponent(publicSlug)}&loc=${locId}`;
}

function embedSnippet(url: string | null): string {
  if (!url) return '';
  return `<iframe src="${url}&embed=1" style="width:100%;min-height:720px;border:0"></iframe>`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function BookingPageEditor() {
  const { activeOrgId, membership } = useSession();
  const qc = useQueryClient();

  const contentQ = useQuery({
    queryKey: ['booking-page', activeOrgId],
    queryFn: () => apiGet<{ data: BookingPageContent }>(`/api/v1/orgs/${activeOrgId}/booking-page`),
    enabled: !!activeOrgId,
  });

  const locationsQ = useQuery({
    queryKey: ['locations-primary', activeOrgId],
    queryFn: () => apiGet<{ data: LocationRow[] }>(`/api/v1/orgs/${activeOrgId}/locations`),
    enabled: !!activeOrgId,
  });

  const policyQ = useQuery({
    queryKey: ['booking-policies', activeOrgId],
    queryFn: () => apiGet<{ data: PolicyRow }>(`/api/v1/orgs/${activeOrgId}/booking-policies`),
    enabled: !!activeOrgId,
  });

  const [heroTitle, setHeroTitle] = useState('');
  const [heroSubtitle, setHeroSubtitle] = useState('');
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [introMarkdown, setIntroMarkdown] = useState('');
  const [confirmationMarkdown, setConfirmationMarkdown] = useState('');
  const [confirmationRedirectUrl, setConfirmationRedirectUrl] = useState('');
  const [showPolicyOnPage, setShowPolicyOnPage] = useState(true);
  const [leadTimeMinHours, setLeadTimeMinHours] = useState(0);
  const [bookingWindowDays, setBookingWindowDays] = useState(60);
  const [maxPartySize, setMaxPartySize] = useState<number | ''>('');
  const [intakeSchedules, setIntakeSchedules] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<'url' | 'embed' | null>(null);

  useEffect(() => {
    const c = contentQ.data?.data;
    if (!c) return;
    setHeroTitle(c.heroTitle ?? '');
    setHeroSubtitle(c.heroSubtitle ?? '');
    setHeroImageUrl(c.heroImageUrl ?? '');
    setIntroMarkdown(c.introMarkdown ?? '');
    setConfirmationMarkdown(c.confirmationMarkdown ?? '');
    setConfirmationRedirectUrl(c.confirmationRedirectUrl ?? '');
    setShowPolicyOnPage(c.showPolicyOnPage);
    setLeadTimeMinHours(c.leadTimeMinHours);
    setBookingWindowDays(c.bookingWindowDays);
    setMaxPartySize(c.maxPartySize ?? '');
    setIntakeSchedules(c.intakeSchedules);
  }, [contentQ.data]);

  const primaryLoc = useMemo(() => {
    const rows = locationsQ.data?.data ?? [];
    return rows.find((l) => l.isPrimary) ?? rows[0] ?? null;
  }, [locationsQ.data]);

  const shareUrl = bookingUrl(membership?.publicSlug ?? null, primaryLoc?.id ?? null);
  const embed = embedSnippet(shareUrl);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!activeOrgId) return;
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      await apiPatch(`/api/v1/orgs/${activeOrgId}/booking-page`, {
        heroTitle: heroTitle.trim() === '' ? null : heroTitle.trim(),
        heroSubtitle: heroSubtitle.trim() === '' ? null : heroSubtitle.trim(),
        heroImageUrl: normalizeUrl(heroImageUrl),
        introMarkdown: introMarkdown.trim() === '' ? null : introMarkdown,
        confirmationMarkdown: confirmationMarkdown.trim() === '' ? null : confirmationMarkdown,
        confirmationRedirectUrl: normalizeUrl(confirmationRedirectUrl),
        showPolicyOnPage,
        leadTimeMinHours,
        bookingWindowDays,
        maxPartySize: maxPartySize === '' ? null : Number(maxPartySize),
        intakeSchedules,
      });
      setMsg('Saved.');
      setTimeout(() => setMsg(null), 2500);
      await qc.invalidateQueries({ queryKey: ['booking-page', activeOrgId] });
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.problem.detail ?? e2.problem.title : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-eyebrow">Settings</div>
          <h1 className="h-display mt-1">Booking page</h1>
          <p className="mt-2 max-w-xl text-sm text-paper-600">
            Customize what visitors see at your public booking page — hero copy, imagery, policy
            display, and scheduling rules. The form fields themselves are configured under{' '}
            <Link href="/app/form" className="link">
              Form fields
            </Link>
            .
          </p>
        </div>
        <div className="flex items-center gap-3">
          {msg ? <span className="text-sm text-accent-700">{msg}</span> : null}
          {err ? <span className="text-sm text-red-700">{err}</span> : null}
          <button type="submit" disabled={saving || !contentQ.data} className="btn">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
        <div className="min-w-0 space-y-6">
          {/* Hero */}
          <section className="panel p-6">
            <h2 className="h-eyebrow">Hero</h2>
            <p className="mt-1 text-xs text-paper-500">
              Shown at the top of the booking page above the calendar.
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <label className="h-eyebrow">Title</label>
                <input
                  className="input mt-1"
                  value={heroTitle}
                  onChange={(e) => setHeroTitle(e.target.value)}
                  placeholder="Book your visit"
                  maxLength={200}
                />
              </div>
              <div>
                <label className="h-eyebrow">Subtitle</label>
                <input
                  className="input mt-1"
                  value={heroSubtitle}
                  onChange={(e) => setHeroSubtitle(e.target.value)}
                  placeholder="We're open Wednesday through Sunday."
                  maxLength={400}
                />
              </div>
              <div>
                <label className="h-eyebrow">Intro</label>
                <textarea
                  className="input mt-1 min-h-[96px]"
                  value={introMarkdown}
                  onChange={(e) => setIntroMarkdown(e.target.value)}
                  placeholder="A short welcome. Markdown links and emphasis are supported."
                  maxLength={4000}
                />
                <p className="mt-1 text-xs text-paper-500">Markdown supported.</p>
              </div>
              <div>
                <label className="h-eyebrow">Hero image URL</label>
                <input
                  className="input mt-1"
                  value={heroImageUrl}
                  onChange={(e) => setHeroImageUrl(e.target.value)}
                  placeholder="https://…"
                />
                <p className="mt-1 text-xs text-paper-500">
                  A wide photo works best (e.g. 1600×600). Leave blank for a clean text-only hero.
                </p>
              </div>
            </div>
          </section>

          {/* Scheduling rules */}
          <section className="panel p-6">
            <h2 className="h-eyebrow">Scheduling rules</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div>
                <label className="h-eyebrow">Earliest bookable</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={720}
                    className="input"
                    value={leadTimeMinHours}
                    onChange={(e) => setLeadTimeMinHours(Math.max(0, Number(e.target.value) || 0))}
                  />
                  <span className="text-sm text-paper-500">hours from now</span>
                </div>
                <p className="mt-1 text-xs text-paper-500">
                  Hide slots closer than this.
                </p>
              </div>
              <div>
                <label className="h-eyebrow">Bookable ahead</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    className="input"
                    value={bookingWindowDays}
                    onChange={(e) => setBookingWindowDays(Math.max(1, Number(e.target.value) || 1))}
                  />
                  <span className="text-sm text-paper-500">days</span>
                </div>
                <p className="mt-1 text-xs text-paper-500">
                  How far in advance visitors can book.
                </p>
              </div>
              <div>
                <label className="h-eyebrow">Max party size</label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  className="input mt-1"
                  value={maxPartySize}
                  onChange={(e) =>
                    setMaxPartySize(e.target.value === '' ? '' : Math.max(1, Number(e.target.value) || 1))
                  }
                  placeholder="No cap"
                />
                <p className="mt-1 text-xs text-paper-500">Blank = no cap.</p>
              </div>
            </div>
          </section>

          {/* Confirmation */}
          <section className="panel p-6">
            <h2 className="h-eyebrow">Confirmation</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="h-eyebrow">Thank-you message</label>
                <textarea
                  className="input mt-1 min-h-[96px]"
                  value={confirmationMarkdown}
                  onChange={(e) => setConfirmationMarkdown(e.target.value)}
                  placeholder="Thanks! We'll see you soon. Markdown supported."
                  maxLength={4000}
                />
                <p className="mt-1 text-xs text-paper-500">
                  Shown after a successful booking. Markdown supported.
                </p>
              </div>
              <div>
                <label className="h-eyebrow">Redirect URL</label>
                <input
                  className="input mt-1"
                  value={confirmationRedirectUrl}
                  onChange={(e) => setConfirmationRedirectUrl(e.target.value)}
                  placeholder="https://your-site.example/thanks"
                />
                <p className="mt-1 text-xs text-paper-500">
                  If set, visitors are forwarded here a few seconds after booking. Leave blank to
                  stay on the confirmation screen.
                </p>
              </div>
            </div>
          </section>

          {/* Policy visibility */}
          <section className="panel p-6">
            <h2 className="h-eyebrow">Policy visibility</h2>
            <label className="mt-4 flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={showPolicyOnPage}
                onChange={(e) => setShowPolicyOnPage(e.target.checked)}
              />
              <span>
                <div className="font-medium">Show my cancellation policy on the booking page</div>
                <div className="text-sm text-paper-600">
                  Displays the refund text from{' '}
                  <Link href="/app/booking-policies" className="link">
                    booking policies
                  </Link>{' '}
                  next to the form.
                </div>
                {policyQ.data?.data.refundPolicyText ? (
                  <div className="mt-2 rounded-md border border-paper-200 bg-paper-50 p-2 text-xs text-paper-600">
                    {policyQ.data.data.refundPolicyText.slice(0, 120)}
                    {policyQ.data.data.refundPolicyText.length > 120 ? '…' : ''}
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-paper-500">
                    No refund text set yet.{' '}
                    <Link href="/app/booking-policies" className="link">
                      Add one →
                    </Link>
                  </div>
                )}
              </span>
            </label>
          </section>

          {/* Intake integration */}
          <section className="panel p-6">
            <h2 className="h-eyebrow">Intake page integration</h2>
            <label className="mt-4 flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={intakeSchedules}
                onChange={(e) => setIntakeSchedules(e.target.checked)}
              />
              <span>
                <div className="font-medium">
                  Also let visitors pick a date/time on my intake form
                </div>
                <div className="text-sm text-paper-600">
                  Your <span className="font-mono text-ink">/intake</span> page adds a &ldquo;Schedule a
                  visit&rdquo; option alongside walk-in check-in. Leave off if you only use intake for
                  walk-ins.
                </div>
              </span>
            </label>
          </section>

          {/* Share */}
          <section className="panel p-6">
            <h2 className="h-eyebrow">Share</h2>
            {!primaryLoc ? (
              <p className="mt-3 text-sm text-paper-500">
                Add a location first to get a shareable URL.{' '}
                <Link href="/app/locations" className="link">
                  Manage locations →
                </Link>
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="h-eyebrow">Public URL</label>
                  <div className="mt-1 flex items-stretch gap-2">
                    <input className="input font-mono" value={shareUrl ?? ''} readOnly />
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={async () => {
                        if (shareUrl && (await copyToClipboard(shareUrl))) {
                          setCopied('url');
                          setTimeout(() => setCopied(null), 1500);
                        }
                      }}
                    >
                      {copied === 'url' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="h-eyebrow">Embed snippet</label>
                  <div className="mt-1 flex items-stretch gap-2">
                    <pre className="input flex-1 overflow-x-auto whitespace-pre font-mono text-xs">
                      {embed}
                    </pre>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={async () => {
                        if (embed && (await copyToClipboard(embed))) {
                          setCopied('embed');
                          setTimeout(() => setCopied(null), 1500);
                        }
                      }}
                    >
                      {copied === 'embed' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
                <div>
                  <a
                    className="link"
                    href={`${API_BASE_URL}/api/v1/orgs/${activeOrgId}/locations/${primaryLoc.id}/qr.png`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download kiosk QR for {primaryLoc.name} →
                  </a>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Preview */}
        <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <h2 className="h-eyebrow mb-2">Preview</h2>
          <div className="overflow-hidden rounded-md border border-paper-200 bg-white">
            {heroImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={heroImageUrl}
                alt=""
                className="h-36 w-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : null}
            <div className="p-6">
              <div className="h-eyebrow text-paper-500">{membership?.orgName ?? 'Your museum'}</div>
              <h3 className="font-display text-2xl tracking-tight-er text-ink">
                {heroTitle || 'Book your visit'}
              </h3>
              {heroSubtitle ? (
                <p className="mt-1 text-sm text-paper-600">{heroSubtitle}</p>
              ) : null}
              {introMarkdown ? (
                <p className="mt-3 whitespace-pre-line text-sm text-paper-700">{introMarkdown}</p>
              ) : null}

              <div className="mt-5 rounded-md border border-paper-200 bg-paper-50/50 p-4">
                <div className="h-eyebrow">Pick a time</div>
                <div className="mt-2 text-xs text-paper-500">Mon · Tue · Wed · Thu · Fri</div>
                <div className="mt-3 grid grid-cols-3 gap-1.5">
                  {['10:00', '10:30', '11:00', '11:30', '12:00', '12:30'].map((t) => (
                    <div
                      key={t}
                      className="rounded-md border border-paper-200 bg-white py-1.5 text-center text-xs text-paper-600"
                    >
                      {t}
                    </div>
                  ))}
                </div>
              </div>

              {showPolicyOnPage && policyQ.data?.data.refundPolicyText ? (
                <div className="mt-4 rounded-md border border-paper-200 bg-paper-50 p-3 text-xs text-paper-600">
                  <div className="h-eyebrow mb-1">Cancellation policy</div>
                  {policyQ.data.data.refundPolicyText}
                </div>
              ) : null}
            </div>
          </div>
          <p className="mt-2 text-xs text-paper-500">
            Rough preview — the live page applies these values.
          </p>
        </aside>
      </div>
    </form>
  );
}
