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
      className="btn shrink-0"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

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
  if (!slug) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-slate-200">
        {(['link', 'qr', 'iframe', 'wordpress'] as Tab[]).map((t) => {
          const disabled = t === 'wordpress';
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && setTab(t)}
              className={
                'px-3 py-2 text-sm capitalize ' +
                (active
                  ? 'border-b-2 border-slate-900 font-medium text-slate-900'
                  : disabled
                    ? 'cursor-not-allowed text-slate-400'
                    : 'text-slate-600 hover:text-slate-900')
              }
            >
              {t === 'wordpress' ? (
                <span className="inline-flex items-center gap-2">
                  WordPress
                  <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Soon</span>
                </span>
              ) : t === 'qr' ? (
                'QR Code'
              ) : (
                t
              )}
            </button>
          );
        })}
      </div>

      {tab === 'link' ? (
        <section className="card space-y-3">
          <h2 className="text-base font-semibold">Public intake link</h2>
          <p className="text-sm text-slate-600">
            Share this URL. Anyone who opens it will see your intake form.
          </p>
          <div className="flex gap-2">
            <input readOnly value={intakeUrl} className="input flex-1" onFocus={(e) => e.currentTarget.select()} />
            <CopyButton value={intakeUrl} />
          </div>
          {IS_DEMO ? (
            <p className="text-xs text-amber-700">Demo instance — this link redirects to the marketing site instead of a real form.</p>
          ) : null}
        </section>
      ) : null}

      {tab === 'qr' ? (
        <section className="card space-y-4">
          <h2 className="text-base font-semibold">QR code</h2>
          <div className="flex flex-col gap-6 sm:flex-row">
            <div className="flex flex-col items-center gap-2">
              {pngBlobUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pngBlobUrl} alt="Intake QR" className="h-64 w-64" />
              ) : (
                <div className="flex h-64 w-64 items-center justify-center text-sm text-slate-500">Loading…</div>
              )}
              <p className="max-w-[16rem] break-all text-center text-xs text-slate-500">{intakeUrl}</p>
            </div>
            <div className="flex-1 space-y-3 text-sm">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Size</span>
                <select className="input mt-1" value={size} onChange={(e) => setSize(Number(e.target.value) as 256 | 512 | 1024)}>
                  <option value={256}>256 px</option>
                  <option value={512}>512 px</option>
                  <option value={1024}>1024 px</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Foreground</span>
                <input type="color" className="mt-1 h-9 w-full rounded border border-slate-300" value={fg} onChange={(e) => setFg(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Background</span>
                <input type="color" className="mt-1 h-9 w-full rounded border border-slate-300" value={bg} onChange={(e) => setBg(e.target.value)} />
              </label>
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button type="button" className="btn" disabled={IS_DEMO} onClick={() => downloadQr('png')}>PNG</button>
                <button type="button" className="btn" disabled={IS_DEMO} onClick={() => downloadQr('svg')}>SVG</button>
                <button type="button" className="btn" disabled={IS_DEMO || !pngBlobUrl} onClick={downloadJpg}>JPG</button>
                <button type="button" className="btn" disabled={IS_DEMO || !pngBlobUrl} onClick={printPdf}>PDF (Print)</button>
              </div>
              {IS_DEMO ? (
                <p className="text-xs text-amber-700">Downloads disabled in demo — QR encodes the marketing site.</p>
              ) : null}
            </div>
          </div>
          <button type="button" onClick={rotate} className="btn-danger">Rotate token (invalidates existing QR)</button>
        </section>
      ) : null}

      {tab === 'iframe' ? (
        <section className="card space-y-3">
          <h2 className="text-base font-semibold">Embed on your website</h2>
          <p className="text-sm text-slate-600">Paste this snippet into any HTML page. The iframe auto-resizes to fit the form.</p>
          <div className="flex gap-2">
            <textarea readOnly value={iframeSnippet} rows={3} className="input flex-1 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <CopyButton value={iframeSnippet} />
          </div>
          {IS_DEMO ? (
            <p className="text-xs text-amber-700">Demo instance — embedded frame redirects to the marketing site.</p>
          ) : null}
        </section>
      ) : null}

      {tab === 'wordpress' ? (
        <section className="card space-y-2 opacity-60">
          <h2 className="text-base font-semibold">WordPress plugin</h2>
          <p className="text-sm text-slate-600">Coming soon — a one-click plugin for embedding your intake form on any WordPress site.</p>
        </section>
      ) : null}
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
