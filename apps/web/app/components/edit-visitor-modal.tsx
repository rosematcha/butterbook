'use client';
/**
 * Edit-in-place for a confirmed / cancelled / no-show visit. Wraps the existing
 * FormRenderer so the form the admin sees here is exactly the form visitors see
 * at the kiosk — no drift.
 *
 * Persists via `PATCH /visits/:id`, which accepts a partial body. We only send
 * fields the user actually changed, so the audit log stays clean.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormField } from '@butterbook/shared';
import { apiGet, apiPatch, ApiError } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useToast } from '../../lib/toast';
import { useTerminology } from '../../lib/use-terminology';
import { Modal } from './modal';
import { FormRenderer } from './form-renderer';
import type { TimelineVisit } from './timeline';

function toLocalDatetimeValue(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EditVisitorModal({
  visit,
  onClose,
}: {
  /** Null = closed. Pass the visit to open the modal in edit mode. */
  visit: TimelineVisit | null;
  onClose: () => void;
}) {
  const { activeOrgId } = useSession();
  const term = useTerminology();
  const qc = useQueryClient();
  const toast = useToast();
  const open = !!visit;

  const fieldsQ = useQuery({
    queryKey: ['form-fields', activeOrgId],
    queryFn: () => apiGet<{ data: { fields: FormField[] } }>(`/api/v1/orgs/${activeOrgId}/form`),
    enabled: !!activeOrgId && open,
  });
  const fields = useMemo(() => fieldsQ.data?.data.fields ?? [], [fieldsQ.data]);

  const [when, setWhen] = useState<string>('');
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (visit) {
      setWhen(toLocalDatetimeValue(new Date(visit.scheduledAt)));
      setValues({ ...visit.formResponse });
      setErr(null);
    }
  }, [visit]);

  const save = useMutation({
    mutationFn: () => {
      if (!visit) throw new Error('no visit');
      const body: Record<string, unknown> = {};
      const newIso = new Date(when).toISOString();
      if (newIso !== new Date(visit.scheduledAt).toISOString()) body.scheduledAt = newIso;
      // Only send formResponse if something changed (shallow-compare keys + values).
      if (!shallowEqualObject(values, visit.formResponse)) body.formResponse = values;
      if (Object.keys(body).length === 0) return Promise.resolve({ data: { ok: true } });
      return apiPatch(`/api/v1/orgs/${activeOrgId}/visits/${visit.id}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visits', activeOrgId] });
      toast.push({ kind: 'success', message: 'Visit updated' });
      onClose();
    },
    onError: (e) => {
      setErr(e instanceof ApiError ? e.problem.detail ?? e.problem.title : 'Save failed');
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={visit ? new Date(visit.scheduledAt).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) : 'Edit'}
      title={`Edit ${term.noun}`}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            disabled={!when || save.isPending}
            onClick={() => { setErr(null); save.mutate(); }}
            className="btn"
          >
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-paper-800">Arrival time</label>
          <input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>
        <div className="divider" />
        {fieldsQ.isLoading ? (
          <p className="text-sm text-paper-500">Loading form…</p>
        ) : visit?.piiRedacted ? (
          <p className="text-sm text-paper-500">
            This visit&apos;s form response has been redacted and can no longer be edited. You can still reschedule or change its status.
          </p>
        ) : (
          <FormRenderer
            fields={fields}
            values={values}
            onChange={(k, v) => setValues((p) => ({ ...p, [k]: v }))}
          />
        )}
        {err ? <p className="text-sm text-red-700">{err}</p> : null}
      </div>
    </Modal>
  );
}

function shallowEqualObject(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!(k in b)) return false;
    const av = a[k]; const bv = b[k];
    if (av === bv) continue;
    // Arrays and plain objects — compare by JSON. Cheap for form responses.
    if (JSON.stringify(av) !== JSON.stringify(bv)) return false;
  }
  return true;
}
