'use client';
import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../../../../lib/api';
import { useSession } from '../../../../../lib/session';

interface GuestPass {
  id: string;
  code: string;
  issuedAt: string;
  expiresAt: string | null;
  redeemedAt: string | null;
}

interface GuestPassListResponse {
  data: GuestPass[];
  meta: { total: number };
}

function PrintContent() {
  const params = useSearchParams();
  const membershipId = params.get('id');
  const { activeOrgId, membership } = useSession();
  const orgName = membership?.orgName ?? '';

  const passes = useQuery({
    queryKey: ['guest-passes-print', activeOrgId, membershipId],
    queryFn: () =>
      apiGet<GuestPassListResponse>(
        `/api/v1/orgs/${activeOrgId}/guest-passes?membership_id=${membershipId}&redeemed=false&limit=200`,
      ),
    enabled: !!activeOrgId && !!membershipId,
  });

  useEffect(() => {
    if (passes.isSuccess && passes.data.data.length > 0) {
      const timer = setTimeout(() => window.print(), 400);
      return () => clearTimeout(timer);
    }
  }, [passes.isSuccess, passes.data]);

  if (!membershipId) return <p className="p-8 text-center">Missing membership ID.</p>;
  if (passes.isPending) return <p className="p-8 text-center">Loading...</p>;
  if (passes.data?.data.length === 0) return <p className="p-8 text-center">No unredeemed guest passes to print.</p>;

  return (
    <div className="mx-auto max-w-xl p-8 print:p-0">
      <style>{`
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
          .pass-card { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
      <h1 className="mb-6 text-center text-lg font-semibold no-print">
        Guest Pass Codes — {orgName}
      </h1>
      <div className="grid gap-4">
        {passes.data!.data.map((pass) => (
          <div
            key={pass.id}
            className="pass-card rounded-lg border border-gray-300 p-6 text-center"
          >
            <div className="text-xs font-semibold uppercase tracking-widest text-gray-500">
              {orgName} Guest Pass
            </div>
            <div className="mt-3 font-mono text-2xl font-bold tracking-wider">
              {pass.code}
            </div>
            {pass.expiresAt ? (
              <div className="mt-2 text-xs text-gray-500">
                Valid until {new Date(pass.expiresAt).toLocaleDateString()}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-xs text-gray-400 no-print">
        {passes.data!.data.length} code{passes.data!.data.length === 1 ? '' : 's'} — close this tab when done
      </p>
    </div>
  );
}

export default function GuestPassPrintPage() {
  return (
    <Suspense fallback={null}>
      <PrintContent />
    </Suspense>
  );
}
