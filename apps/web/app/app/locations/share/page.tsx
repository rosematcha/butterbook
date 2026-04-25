'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiGet, apiPost, getToken } from '../../../../lib/api';
import { API_BASE_URL, IS_DEMO, MARKETING_URL } from '../../../../lib/env';
import { useSession } from '../../../../lib/session';

type Tab = 'link' | 'qr' | 'iframe' | 'wordpress';

interface OrgRow {
  data: { id: string; publicSlug: string };
}

function publicBaseUrl(): string {
  // The marketing/public site base. In prod this is set via env; fallback to
  // window.location.origin so local dev works.
  if (typeof window !== 'undefined') {
    const fromEnv = process.env.NEXT_PUBLIC_PUBLIC_SITE_URL;
    if (fromEnv) return fromEnv.replace(/\/+$/, '');
    return window.location.origin;
  }
  return '';
}

function CopyButton({ value, disabled }: { value: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // noop
        }
      }}
      className="btn shrink-0 min-w-[5.5rem]"
      aria-live="polite"
    >
      {copied ? 'Copied ✓' : 'Copy'}
    </button>
  );
}

const CHANNELS: { id: Tab; num: string; label: string; blurb: string; disabled?: boolean }[] = [
  { id: 'link', num: '01', label: 'Direct link', blurb: 'A plain URL. Email it, text it, print it.' },
  { id: 'qr', num: '02', label: 'QR code', blurb: 'Printable signage for gallery walls, tabletops, and lobby cards.' },
  { id: 'iframe', num: '03', label: 'Embed', blurb: 'Drop the form into any page of your website via iframe.' },
  { id: 'wordpress', num: '04', label: 'WordPress', blurb: 'One-click plugin. Currently in preparation.', disabled: true },
];

function ShareInner() {
  const search = useSearchParams();
  const id = search.get('id') ?? '';
  const { activeOrgId } = useSession();
  const [tab, setTab] = useState<Tab>('link');
  const [size, setSize] = useState<256 | 512 | 1024>(512);
  const [fg, setFg] = useState('#000000');
  const [bg, setBg] = useState('#ffffff');
  const [pngBlobUrl, setPngBlobUrl] = useState<string | null>(null);

  const org = useMemo(() => {
    if (!activeOrgId) return null;
    return { orgId: activeOrgId };
  }, [activeOrgId]);

  const [slug, setSlug] = useState<string | null>(null);
  useEffect(() => {
    if (!org) return;
    apiGet<OrgRow>(`/api/v1/orgs/${org.orgId}`)
      .then((r) => setSlug(r.data.publicSlug))
      .catch(() => setSlug(null));
  }, [org]);

  const intakeUrl = IS_DEMO
    ? MARKETING_URL
    : slug
      ? `${publicBaseUrl()}/intake?org=${slug}`
      : '';
  const embedUrl = IS_DEMO
    ? MARKETING_URL
    : slug
      ? `${publicBaseUrl()}/embed?org=${slug}`
      : '';
  const iframeSnippet = `<iframe src="${embedUrl}" width="100%" height="640" style="border:0" title="Check-in"></iframe>`;

  // Fetch customized PNG for preview + JPG conversion.
  useEffect(() => {
    if (!activeOrgId || !id || tab !== 'qr') return;
    const qs = new URLSearchParams({ format: 'png', size: String(size), fg, bg });
    fetch(`${API_BASE_URL}/api/v1/orgs/${activeOrgId}/locations/${id}/qr?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${getToken() ?? ''}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('failed');
        const blob = await r.blob();
        setPngBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      })
      .catch(() => setPngBlobUrl(null));
    return () => {
      /* noop */
    };
  }, [activeOrgId, id, tab, size, fg, bg]);

  async function downloadQr(format: 'png' | 'svg') {
    if (!activeOrgId || !id) return;
    const qs = new URLSearchParams({ format, size: String(size), fg, bg });
    const res = await fetch(`${API_BASE_URL}/api/v1/orgs/${activeOrgId}/locations/${id}/qr?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${getToken() ?? ''}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `intake-qr.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadJpg() {
    if (!pngBlobUrl) return;
    const img = new Image();
    img.src = pngBlobUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image load failed'));
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'intake-qr.jpg';
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/jpeg', 0.95);
  }

  function printPdf() {
    if (!pngBlobUrl) return;
    const w = window.open('', '_blank', 'width=600,height=800');
    if (!w) return;
    w.document.write(`
      <!doctype html><html><head><title>Intake QR</title>
      <style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;padding:40px}img{max-width:400px;height:auto}p{margin-top:16px;color:#333}</style>
      </head><body>
      <img src="${pngBlobUrl}" alt="QR" />
      <p>${intakeUrl}</p>
      <script>window.onload = () => { window.print(); }</script>
      </body></html>
    `);
    w.document.close();
  }

  async function rotate() {
    if (!activeOrgId || !id) return;
    if (!window.confirm('Rotate the QR token? Existing printed signage will stop working.')) return;
    await apiPost(`/api/v1/orgs/${activeOrgId}/locations/${id}/qr/rotate`);
    window.location.reload();
  }

  if (!id) return <p className="text-sm text-red-600">Missing location id.</p>;
  if (!slug) return <p className="text-sm text-paper-500">Loading…</p>;

  const active = CHANNELS.find((c) => c.id === tab) ?? CHANNELS[0];

  return (
    <div className="space-y-8">
      {/* Masthead */}
      <header className="flex flex-col gap-2 border-b border-paper-200 pb-6">
        <span className="eyebrow">Plate · Distribution</span>
        <h1 className="h-display">Share your intake form</h1>
        <p className="max-w-2xl text-sm text-paper-600">
          Four channels for reaching your visitors. Pick the one that fits the space: a link in an
          email, a QR on a gallery wall, an embed on your site, or a plugin for WordPress.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        {/* Channel index — museum catalogue style */}
        <nav aria-label="Distribution channels" className="lg:border-r lg:border-paper-200 lg:pr-6">
          <span className="eyebrow mb-3 block">Channels</span>
          <ol className="space-y-1">
            {CHANNELS.map((c) => {
              const isActive = c.id === tab;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={c.disabled}
                    onClick={() => !c.disabled && setTab(c.id)}
                    className={[
                      'group relative block w-full rounded-md px-3 py-2.5 text-left transition',
                      isActive
                        ? 'bg-brand-accent/8 ring-1 ring-brand-accent/30'
                        : c.disabled
                          ? 'cursor-not-allowed opacity-50'
                          : 'hover:bg-paper-100',
                    ].join(' ')}
                    style={isActive ? { backgroundColor: 'rgb(176 87 61 / 0.07)' } : undefined}
                  >
                    <span className="flex items-baseline gap-3">
                      <span
                        className={[
                          'font-mono text-[11px] tabular-nums tracking-wider',
                          isActive ? 'text-brand-accent' : 'text-paper-500',
                        ].join(' ')}
                      >
                        {c.num}
                      </span>
                      <span className="flex-1">
                        <span
                          className={[
                            'font-display text-[17px] leading-tight',
                            isActive ? 'text-ink' : 'text-paper-800 group-hover:text-ink',
                          ].join(' ')}
                        >
                          {c.label}
                        </span>
                        {c.disabled ? (
                          <span className="badge ml-2 text-[9px]">Soon</span>
                        ) : null}
                        <span className="mt-0.5 block text-[12px] leading-snug text-paper-500">
                          {c.blurb}
                        </span>
                      </span>
                    </span>
                    {isActive ? (
                      <span
                        aria-hidden
                        className="absolute inset-y-2 left-0 w-[2px] rounded-r bg-brand-accent"
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="mt-6 hidden rounded-md border border-dashed border-paper-300 bg-paper-50 px-3 py-3 text-[11px] leading-relaxed text-paper-600 lg:block">
            <span className="eyebrow mb-1 block text-paper-500">Tip</span>
            Print the QR at 512 px or larger for reliable scanning from two meters.
          </div>
        </nav>

        {/* Active channel content */}
        <div className="min-w-0">
          <div className="mb-4 flex items-baseline justify-between gap-4 border-b border-paper-200 pb-3">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-xs tabular-nums text-brand-accent">{active.num}</span>
              <h2 className="font-display text-2xl leading-tight text-ink">{active.label}</h2>
            </div>
            {IS_DEMO ? <span className="badge">Demo mode</span> : null}
          </div>

          {tab === 'link' ? (
            <section className="panel space-y-5 p-6">
              <p className="text-sm leading-relaxed text-paper-700">
                Share this URL. Anyone who opens it will see your intake form.
              </p>
              <div>
                <label className="eyebrow mb-2 block">Public intake URL</label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={intakeUrl}
                    className="input flex-1 font-mono text-[13px]"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <CopyButton value={intakeUrl} />
                </div>
              </div>
              {IS_DEMO ? (
                <p className="rounded-md border border-amber-200/70 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Demo instance. This link redirects to the marketing site instead of a real form.
                </p>
              ) : null}
            </section>
          ) : null}

          {tab === 'qr' ? (
            <section className="space-y-5">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                {/* QR mat/frame — museum label */}
                <div className="panel p-6">
                  <div className="flex flex-col items-center">
                    <div
                      className="relative rounded-sm bg-white p-6 shadow-[0_1px_0_rgb(0_0_0/0.04),0_12px_32px_-16px_rgb(61_56_50/0.35)] ring-1 ring-paper-200"
                      style={{ backgroundColor: bg }}
                    >
                      {pngBlobUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={pngBlobUrl} alt="Intake QR" className="h-56 w-56" />
                      ) : (
                        <div className="flex h-56 w-56 items-center justify-center text-sm text-paper-500">
                          Rendering…
                        </div>
                      )}
                    </div>
                    <div className="mt-5 w-full max-w-[20rem] border-t border-paper-200 pt-3 text-center">
                      <span className="eyebrow block">Encodes</span>
                      <p className="mt-1 break-all font-mono text-[11px] leading-relaxed text-paper-600">
                        {intakeUrl}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Controls */}
                <div className="panel space-y-4 p-5 text-sm">
                  <div>
                    <span className="eyebrow mb-2 block">Specifications</span>
                    <label className="mt-2 block">
                      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-paper-600">
                        Size
                      </span>
                      <select
                        className="input"
                        value={size}
                        onChange={(e) => setSize(Number(e.target.value) as 256 | 512 | 1024)}
                      >
                        <option value={256}>256 px · small</option>
                        <option value={512}>512 px · standard</option>
                        <option value={1024}>1024 px · poster</option>
                      </select>
                    </label>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-paper-600">
                          Ink
                        </span>
                        <div className="flex items-center gap-2 rounded-md border border-paper-300 bg-white p-1.5">
                          <input
                            type="color"
                            className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                            value={fg}
                            onChange={(e) => setFg(e.target.value)}
                          />
                          <span className="font-mono text-[11px] uppercase text-paper-600">{fg}</span>
                        </div>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-paper-600">
                          Paper
                        </span>
                        <div className="flex items-center gap-2 rounded-md border border-paper-300 bg-white p-1.5">
                          <input
                            type="color"
                            className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                            value={bg}
                            onChange={(e) => setBg(e.target.value)}
                          />
                          <span className="font-mono text-[11px] uppercase text-paper-600">{bg}</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="border-t border-paper-200 pt-4">
                    <span className="eyebrow mb-2 block">Export</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={IS_DEMO}
                        onClick={() => downloadQr('png')}
                      >
                        PNG
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={IS_DEMO}
                        onClick={() => downloadQr('svg')}
                      >
                        SVG
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={IS_DEMO || !pngBlobUrl}
                        onClick={downloadJpg}
                      >
                        JPG
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={IS_DEMO || !pngBlobUrl}
                        onClick={printPdf}
                      >
                        Print
                      </button>
                    </div>
                  </div>

                  {IS_DEMO ? (
                    <p className="rounded-md border border-amber-200/70 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                      Downloads disabled in demo. QR encodes the marketing site.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <span className="eyebrow block">Security</span>
                  <p className="mt-1 text-sm text-paper-700">
                    Rotate the QR token if signage has been lost, stolen, or you want to force a refresh.
                    Any printed QR currently in the wild will stop working.
                  </p>
                </div>
                <button type="button" onClick={rotate} className="btn-danger shrink-0">
                  Rotate token
                </button>
              </div>
            </section>
          ) : null}

          {tab === 'iframe' ? (
            <section className="panel space-y-5 p-6">
              <p className="text-sm leading-relaxed text-paper-700">
                Paste this snippet into any HTML page. The iframe renders the intake form inline on
                your site. Visitors never leave.
              </p>
              <div>
                <label className="eyebrow mb-2 block">HTML snippet</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <textarea
                    readOnly
                    value={iframeSnippet}
                    rows={3}
                    className="input flex-1 font-mono text-[12px] leading-relaxed"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <CopyButton value={iframeSnippet} />
                </div>
              </div>
              {IS_DEMO ? (
                <p className="rounded-md border border-amber-200/70 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Demo instance. Embedded frame redirects to the marketing site.
                </p>
              ) : null}
            </section>
          ) : null}

          {tab === 'wordpress' ? (
            <section className="panel relative overflow-hidden p-8">
              <div
                aria-hidden
                className="absolute inset-0 opacity-[0.04]"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(45deg, #3d3832 0, #3d3832 1px, transparent 1px, transparent 12px)',
                }}
              />
              <div className="relative flex flex-col items-start gap-3">
                <span className="badge">In preparation</span>
                <h3 className="h-display text-2xl">A one-click WordPress plugin</h3>
                <p className="max-w-xl text-sm leading-relaxed text-paper-700">
                  Install, enter your org slug, and drop an intake shortcode onto any post or page.
                  We&apos;re polishing the submission now. Email us if you&apos;d like early access.
                </p>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
      <ShareInner />
    </Suspense>
  );
}
