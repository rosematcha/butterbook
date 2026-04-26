'use client';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { FormField } from '@butterbook/shared';
import { apiGet, apiPost, ApiError } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useTerminology } from '../../lib/use-terminology';
import { Modal } from './modal';
import { FormRenderer } from './form-renderer';

interface Location { id: string; name: string; isPrimary: boolean }

function roundToNextFive(d: Date): Date {
  const r = new Date(d);
  r.setSeconds(0, 0);
  const extra = 5 - (r.getMinutes() % 5);
  if (extra !== 5) r.setMinutes(r.getMinutes() + extra);
  return r;
}

function toLocalDatetimeValue(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AddVisitorModal({
  open,
  onClose,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  defaultDate?: Date;
}) {
  const { activeOrgId } = useSession();
  const term = useTerminology();
  const qc = useQueryClient();

  const locations = useQuery({
    queryKey: ['locations', activeOrgId],
    queryFn: () => apiGet<{ data: Location[] }>(`/api/v1/orgs/${activeOrgId}/locations`),
    enabled: !!activeOrgId && open,
  });
  const fieldsQ = useQuery({
    queryKey: ['form-fields', activeOrgId],
    queryFn: () => apiGet<{ data: { fields: FormField[] } }>(`/api/v1/orgs/${activeOrgId}/form`),
    enabled: !!activeOrgId && open,
  });

  const [locationId, setLocationId] = useState<string>('');
  const [when, setWhen] = useState<string>(() => toLocalDatetimeValue(roundToNextFive(defaultDate ?? new Date())));
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setWhen(toLocalDatetimeValue(roundToNextFive(defaultDate ?? new Date())));
      setValues({});
      setErr(null);
    }
  }, [open, defaultDate]);

  useEffect(() => {
    if (!locationId && locations.data) {
      const primary = locations.data.data.find((l) => l.isPrimary) ?? locations.data.data[0];
      if (primary) setLocationId(primary.id);
    }
  }, [locations.data, locationId]);

  const fields = useMemo(() => fieldsQ.data?.data.fields ?? [], [fieldsQ.data]);

  const create = useMutation({
    mutationFn: () => {
      const iso = new Date(when).toISOString();
      return apiPost(`/api/v1/orgs/${activeOrgId}/visits`, {
        locationId,
        scheduledAt: iso,
        formResponse: values,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visits', activeOrgId] });
      onClose();
    },
    onError: (e) => {
      setErr(e instanceof ApiError ? e.problem.detail ?? e.problem.title : 'Failed to create visit');
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={`New ${term.noun}`}
      title={`Add a ${term.noun}`}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            disabled={!locationId || !when || create.isPending}
            onClick={() => { setErr(null); create.mutate(); }}
            className="btn"
          >
            {create.isPending ? 'Saving…' : `Add ${term.noun}`}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-paper-800">Location</label>
            <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {(locations.data?.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>{l.name}{l.isPrimary ? ' (primary)' : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-paper-800">Arrival time</label>
            <input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
        </div>

        <div className="divider" />

        {fieldsQ.isLoading ? (
          <p className="text-sm text-paper-500">Loading form…</p>
        ) : (
          <FormRenderer fields={fields} values={values} onChange={(k, v) => setValues((p) => ({ ...p, [k]: v }))} />
        )}

        {err ? <p className="text-sm text-red-700">{err}</p> : null}
      </div>
    </Modal>
  );
}
