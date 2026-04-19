'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiPost, getToken } from '../../../../lib/api';
import { API_BASE_URL } from '../../../../lib/env';
import { useSession } from '../../../../lib/session';

function QrInner() {
  const search = useSearchParams();
  const id = search.get('id') ?? '';
  const { activeOrgId } = useSession();
  const [pngUrl, setPngUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!activeOrgId || !id) return;
    const url = `${API_BASE_URL}/api/v1/orgs/${activeOrgId}/locations/${id}/qr`;
    fetch(url, { headers: { Authorization: `Bearer ${getToken() ?? ''}` } })
      .then(async (r) => {
        if (!r.ok) throw new Error('failed');
        const blob = await r.blob();
        setPngUrl(URL.createObjectURL(blob));
      })
      .catch(() => setPngUrl(null));
  }, [activeOrgId, id]);

  async function rotate() {
    await apiPost(`/api/v1/orgs/${activeOrgId}/locations/${id}/qr/rotate`);
    window.location.reload();
  }

  if (!id) return <p className="text-sm text-red-600">Missing location id.</p>;

  return (
    <div className="space-y-4">
      <div className="card flex flex-col items-center">
        {pngUrl ? (
          // Using a plain img because the source is a blob URL from an authenticated fetch.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pngUrl} alt="Kiosk QR" className="h-64 w-64" />
        ) : (
          <div className="text-sm text-slate-500">Loading…</div>
        )}
        <p className="mt-2 text-sm text-slate-600">Print + display at the front desk. Scanning opens the kiosk page.</p>
      </div>
      <button onClick={rotate} className="btn-danger">Rotate token (invalidates this QR)</button>
    </div>
  );
}

export default function QrPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
      <QrInner />
    </Suspense>
  );
}
