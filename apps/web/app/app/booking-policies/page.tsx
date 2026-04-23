'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, ApiError } from '../../../lib/api';
import { useSession } from '../../../lib/session';

interface Policy {
  cancelCutoffHours: number;
  rescheduleCutoffHours: number;
  selfCancelEnabled: boolean;
  selfRescheduleEnabled: boolean;
  refundPolicyText: string | null;
}

export default function BookingPoliciesPage() {
  const { activeOrgId } = useSession();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['booking-policies', activeOrgId],
    queryFn: () => apiGet<{ data: Policy }>(`/api/v1/orgs/${activeOrgId}/booking-policies`),
    enabled: !!activeOrgId,
  });

  const [cancelCutoffHours, setCancelCutoffHours] = useState(2);
  const [rescheduleCutoffHours, setRescheduleCutoffHours] = useState(2);
  const [selfCancelEnabled, setSelfCancelEnabled] = useState(true);
  const [selfRescheduleEnabled, setSelfRescheduleEnabled] = useState(false);
  const [refundPolicyText, setRefundPolicyText] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const p = query.data?.data;
    if (!p) return;
    setCancelCutoffHours(p.cancelCutoffHours);
    setRescheduleCutoffHours(p.rescheduleCutoffHours);
    setSelfCancelEnabled(p.selfCancelEnabled);
    setSelfRescheduleEnabled(p.selfRescheduleEnabled);
    setRefundPolicyText(p.refundPolicyText ?? '');
  }, [query.data]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!activeOrgId) return;
    setSaving(true);
    setMsg(null);
    setErr(null);
    try {
      await apiPatch(`/api/v1/orgs/${activeOrgId}/booking-policies`, {
        cancelCutoffHours,
        rescheduleCutoffHours,
        selfCancelEnabled,
        selfRescheduleEnabled,
        refundPolicyText: refundPolicyText.trim() === '' ? null : refundPolicyText,
      });
      setMsg('Saved.');
      setTimeout(() => setMsg(null), 2500);
      await qc.invalidateQueries({ queryKey: ['booking-policies', activeOrgId] });
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
          <h1 className="h-display mt-1">Booking policies</h1>
          <p className="mt-2 max-w-xl text-sm text-paper-600">
            Controls whether visitors can cancel or reschedule themselves via the link in their
            confirmation email, and how close to the booking time those actions are allowed.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {msg ? <span className="text-sm text-accent-700">{msg}</span> : null}
          {err ? <span className="text-sm text-red-700">{err}</span> : null}
          <button type="submit" disabled={saving || !query.data} className="btn">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <div className="panel max-w-xl space-y-6 p-6">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={selfCancelEnabled}
            onChange={(e) => setSelfCancelEnabled(e.target.checked)}
          />
          <span>
            <div className="font-medium">Allow visitors to cancel</div>
            <div className="text-sm text-paper-600">The cancel button appears on the manage link.</div>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1"
            checked={selfRescheduleEnabled}
            onChange={(e) => setSelfRescheduleEnabled(e.target.checked)}
          />
          <span>
            <div className="font-medium">Allow visitors to reschedule</div>
            <div className="text-sm text-paper-600">Shows a date/slot picker on the manage link.</div>
          </span>
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="h-eyebrow">Cancel cutoff (hours)</span>
            <input
              type="number"
              className="input mt-1"
              min={0}
              max={168}
              value={cancelCutoffHours}
              onChange={(e) => setCancelCutoffHours(Number(e.target.value))}
            />
          </label>
          <label className="block">
            <span className="h-eyebrow">Reschedule cutoff (hours)</span>
            <input
              type="number"
              className="input mt-1"
              min={0}
              max={168}
              value={rescheduleCutoffHours}
              onChange={(e) => setRescheduleCutoffHours(Number(e.target.value))}
            />
          </label>
        </div>

        <label className="block">
          <span className="h-eyebrow">Refund policy text</span>
          <textarea
            className="input mt-1 min-h-[90px]"
            placeholder="Shown to visitors next to the cancel button. Leave blank to hide."
            value={refundPolicyText}
            onChange={(e) => setRefundPolicyText(e.target.value)}
          />
        </label>
      </div>
    </form>
  );
}
