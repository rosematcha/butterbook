'use client';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormField, FieldType, FieldLibraryEntry } from '@butterbook/shared';
import { apiGet, apiPut, ApiError } from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { useSession } from '../../../lib/session';
import { SkeletonBlock } from '../../components/skeleton-rows';
import { uniqueFieldKey } from '../../../lib/unique-field-key';
import { LibraryModal } from '../../components/field-library-modal';
import { EmptyState } from '../../components/empty-state';

type Draft = FormField & { _id: string };

const TYPE_OPTIONS: Array<{ value: FieldType; label: string; takesOptions?: boolean }> = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'url', label: 'URL' },
  { value: 'date', label: 'Date' },
  { value: 'time', label: 'Time' },
  { value: 'select', label: 'Dropdown', takesOptions: true },
  { value: 'radio', label: 'Radio group', takesOptions: true },
  { value: 'multiselect', label: 'Multi-select', takesOptions: true },
  { value: 'checkbox', label: 'Checkbox (yes/no)' },
];

function mkId(): string { return Math.random().toString(36).slice(2, 10); }
function fromField(f: FormField): Draft { return { ...f, _id: mkId() }; }
function toField(d: Draft): FormField {
  const { _id: _omit, ...rest } = d;
  return rest;
}
function keyify(label: string): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!base) return 'field';
  return /^[a-z]/.test(base) ? base : `f_${base}`;
}

const takesOptions = (t: FieldType) => t === 'select' || t === 'radio' || t === 'multiselect';
const isTextish = (t: FieldType) => t === 'text' || t === 'textarea';
const canBePrimary = (t: FieldType) => t !== 'checkbox';

export default function FormFieldsPage() {
  const { activeOrgId } = useSession();
  const perms = usePermissions();
  const canManage = perms.has('admin.manage_forms');
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ['form-fields', activeOrgId],
    queryFn: () => apiGet<{ data: { fields: FormField[] } }>(`/api/v1/orgs/${activeOrgId}/form`),
    enabled: !!activeOrgId && canManage,
  });

  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [advanced, setAdvanced] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  // Map draft _id → library entry id, so removing a draft clears its "Added" badge.
  const [draftToPreset, setDraftToPreset] = useState<Record<string, string>>({});
  const addedFromLibrary = useMemo(() => {
    const s = new Set<string>();
    for (const d of drafts) {
      const pid = draftToPreset[d._id];
      if (pid) s.add(pid);
    }
    return s;
  }, [drafts, draftToPreset]);

  useEffect(() => {
    if (q.data) {
      setDrafts(q.data.data.fields.map(fromField));
      setDraftToPreset({});
    }
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => {
      const fields = drafts.map((d, i): FormField => {
        const base = { ...toField(d), displayOrder: i };
        // Strip options on types that don't use them.
        if (!takesOptions(base.fieldType)) {
          const { options: _o, ...rest } = base;
          return rest;
        }
        return base;
      });
      return apiPut(`/api/v1/orgs/${activeOrgId}/form`, { fields });
    },
    onSuccess: () => {
      setMsg('Saved.');
      setErr(null);
      qc.invalidateQueries({ queryKey: ['form-fields', activeOrgId] });
      setTimeout(() => setMsg(null), 2000);
    },
    onError: (e) => {
      setMsg(null);
      setErr(e instanceof ApiError ? e.problem.detail ?? e.problem.title : 'Failed to save');
    },
  });

  const update = (id: string, patch: Partial<Draft>) => {
    setDrafts((prev) => prev.map((d) => (d._id === id ? { ...d, ...patch } : d)));
  };

  const updateValidation = (id: string, patch: Partial<NonNullable<FormField['validation']>>) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d._id !== id) return d;
        const v = { ...(d.validation ?? {}), ...patch };
        // Drop keys whose value is undefined / '' to keep the payload clean.
        for (const k of Object.keys(v) as Array<keyof typeof v>) {
          if (v[k] === undefined || v[k] === '' || v[k] === null) delete v[k];
        }
        return { ...d, validation: Object.keys(v).length ? v : undefined };
      }),
    );
  };

  const setPrimary = (id: string) => {
    setDrafts((prev) => prev.map((d) => ({ ...d, isPrimaryLabel: d._id === id })));
  };

  const clearPrimary = () => {
    setDrafts((prev) => prev.map((d) => ({ ...d, isPrimaryLabel: false })));
  };

  const addField = () => {
    const id = mkId();
    const existingKeys = new Set(drafts.map((d) => d.fieldKey));
    let n = drafts.length + 1;
    let key = `field_${n}`;
    while (existingKeys.has(key)) { n++; key = `field_${n}`; }
    const d: Draft = {
      _id: id,
      fieldKey: key,
      label: 'New field',
      fieldType: 'text',
      required: false,
      isSystem: false,
      isPrimaryLabel: false,
      displayOrder: drafts.length,
    };
    setDrafts((p) => [...p, d]);
    setExpanded((s) => new Set(s).add(id));
  };

  const remove = (id: string) => {
    setDrafts((p) => p.filter((d) => d._id !== id));
    setExpanded((s) => { const n = new Set(s); n.delete(id); return n; });
    setDraftToPreset((m) => { if (!(id in m)) return m; const n = { ...m }; delete n[id]; return n; });
  };

  const addFromLibrary = (entry: FieldLibraryEntry) => {
    const id = mkId();
    setDrafts((prev) => {
      const key = uniqueFieldKey(entry.field.fieldKey, prev);
      const alreadyHasPrimary = prev.some((d) => d.isPrimaryLabel);
      const draft: Draft = {
        ...entry.field,
        fieldKey: key,
        required: entry.field.required ?? false,
        isSystem: entry.field.isSystem ?? false,
        isPrimaryLabel: entry.field.isPrimaryLabel && !alreadyHasPrimary ? true : false,
        displayOrder: prev.length,
        _id: id,
      };
      return [...prev, draft];
    });
    setDraftToPreset((m) => ({ ...m, [id]: entry.id }));
  };

  const move = (id: string, dir: -1 | 1) => {
    setDrafts((prev) => {
      const idx = prev.findIndex((d) => d._id === id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next]!, copy[idx]!];
      return copy;
    });
  };

  const toggleExpanded = (id: string) => {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleAdvanced = (id: string) => {
    setAdvanced((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const hasPrimary = drafts.some((d) => d.isPrimaryLabel);

  if (!perms.loading && !canManage) {
    return (
      <EmptyState
        title="Permission required."
        description="Editing the visitor form requires the admin.manage_forms permission. Ask a superadmin to grant it."
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <div className="h-eyebrow">Settings</div>
          <h1 className="h-display mt-1">Form fields</h1>
          <p className="mt-2 max-w-xl text-sm text-paper-600">
            These are the questions every visitor answers when they check in. Fields can be reordered, edited, or removed freely — mark one as the
            {' '}<span className="text-ink">primary label</span> to decide whose value shows up in the visitor list.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setLibraryOpen(true)} className="btn-secondary">+ Add field</button>
          <button onClick={() => save.mutate()} disabled={save.isPending} className="btn">
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {!hasPrimary && drafts.length > 0 ? (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          No field is marked as the primary label — visitors will show up as “Unknown” in lists. Pick one below.
        </div>
      ) : null}

      {q.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-md border border-paper-200 bg-white px-3 py-3">
              <SkeletonBlock className="h-4 w-48" />
              <SkeletonBlock className="mt-2 h-3 w-24" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {drafts.map((d, i) => {
            const isOpen = expanded.has(d._id);
            const isAdvanced = advanced.has(d._id);
            const typeMeta = TYPE_OPTIONS.find((t) => t.value === d.fieldType);
            return (
              <div key={d._id} className="rounded-md border border-paper-200 bg-white">
                {/* Row header */}
                <div className="flex items-center gap-3 px-3 py-2">
                  <div className="flex flex-col text-paper-400">
                    <button onClick={() => move(d._id, -1)} disabled={i === 0} className="px-1 leading-none hover:text-ink disabled:opacity-30" aria-label="Move up">↑</button>
                    <button onClick={() => move(d._id, 1)} disabled={i === drafts.length - 1} className="px-1 leading-none hover:text-ink disabled:opacity-30" aria-label="Move down">↓</button>
                  </div>

                  <button onClick={() => toggleExpanded(d._id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate font-medium text-ink">{d.label || <em className="text-paper-400">Untitled</em>}</span>
                        {d.isPrimaryLabel ? <span className="rounded-sm bg-brand-primary px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-brand-on-primary">Primary</span> : null}
                        {d.required ? <span className="text-[10px] uppercase tracking-wider text-brand-accent">Required</span> : null}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-paper-500">
                        {typeMeta?.label ?? d.fieldType}
                      </div>
                    </div>
                    <span className="text-paper-400">{isOpen ? '▾' : '▸'}</span>
                  </button>

                  <button onClick={() => remove(d._id)} className="btn-ghost text-xs text-red-700 hover:bg-red-50">Remove</button>
                </div>

                {/* Expanded editor */}
                {isOpen ? (
                  <div className="border-t border-paper-200 p-4">
                    {/* Basics — always visible when expanded */}
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <label className="h-eyebrow">Question</label>
                        <input
                          className="input mt-1"
                          value={d.label}
                          placeholder="e.g. Your name"
                          onChange={(e) => update(d._id, { label: e.target.value })}
                        />
                      </div>

                      <div>
                        <label className="h-eyebrow">Type of answer</label>
                        <select
                          className="input mt-1"
                          value={d.fieldType}
                          onChange={(e) => update(d._id, { fieldType: e.target.value as FieldType, validation: undefined })}
                        >
                          {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>

                      <div className="flex flex-col justify-center gap-2 pt-5">
                        <label className="flex items-center gap-2 text-sm text-paper-700">
                          <input
                            type="checkbox"
                            checked={d.required}
                            onChange={(e) => update(d._id, { required: e.target.checked })}
                          />
                          Required
                        </label>
                        {canBePrimary(d.fieldType) ? (
                          <label className="flex items-center gap-2 text-sm text-paper-700">
                            <input
                              type="checkbox"
                              checked={!!d.isPrimaryLabel}
                              onChange={(e) => (e.target.checked ? setPrimary(d._id) : clearPrimary())}
                            />
                            Use this as the visitor’s name in lists
                          </label>
                        ) : null}
                      </div>

                      {takesOptions(d.fieldType) ? (
                        <div className="md:col-span-2">
                          <label className="h-eyebrow">Choices</label>
                          <textarea
                            className="input mt-1 min-h-[96px]"
                            placeholder={'One per line, e.g.\nAdult\nChild\nSenior'}
                            value={(d.options ?? []).join('\n')}
                            onChange={(e) => update(d._id, { options: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
                          />
                        </div>
                      ) : null}
                    </div>

                    {/* Advanced — hidden behind a toggle */}
                    <div className="mt-4 border-t border-paper-100 pt-3">
                      <button
                        type="button"
                        onClick={() => toggleAdvanced(d._id)}
                        className="text-xs font-medium uppercase tracking-[0.14em] text-paper-500 hover:text-ink"
                      >
                        {isAdvanced ? '− Hide options' : '+ More options'}
                      </button>

                      {isAdvanced ? (
                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <div className="md:col-span-2">
                            <label className="h-eyebrow">Placeholder</label>
                            <input
                              className="input mt-1"
                              value={d.placeholder ?? ''}
                              placeholder="Greyed-out example text shown inside the field"
                              onChange={(e) => update(d._id, { placeholder: e.target.value || undefined })}
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label className="h-eyebrow">Help text</label>
                            <input
                              className="input mt-1"
                              value={d.helpText ?? ''}
                              placeholder="Small note shown below the field"
                              onChange={(e) => update(d._id, { helpText: e.target.value || undefined })}
                            />
                          </div>

                          {d.fieldType === 'number' ? (
                            <>
                              <div>
                                <label className="h-eyebrow">Smallest allowed</label>
                                <input
                                  type="number"
                                  className="input mt-1"
                                  value={d.validation?.min ?? ''}
                                  onChange={(e) => updateValidation(d._id, { min: e.target.value === '' ? undefined : Number(e.target.value) })}
                                />
                              </div>
                              <div>
                                <label className="h-eyebrow">Largest allowed</label>
                                <input
                                  type="number"
                                  className="input mt-1"
                                  value={d.validation?.max ?? ''}
                                  onChange={(e) => updateValidation(d._id, { max: e.target.value === '' ? undefined : Number(e.target.value) })}
                                />
                              </div>
                              <div className="md:col-span-2">
                                <label className="flex items-center gap-2 text-sm text-paper-700">
                                  <input
                                    type="checkbox"
                                    checked={!!d.validation?.integer}
                                    onChange={(e) => updateValidation(d._id, { integer: e.target.checked || undefined })}
                                  />
                                  Whole numbers only (no decimals)
                                </label>
                              </div>
                            </>
                          ) : null}

                          {isTextish(d.fieldType) ? (
                            <>
                              <div>
                                <label className="h-eyebrow">Min characters</label>
                                <input
                                  type="number" min={0}
                                  className="input mt-1"
                                  value={d.validation?.minLength ?? ''}
                                  onChange={(e) => updateValidation(d._id, { minLength: e.target.value === '' ? undefined : Number(e.target.value) })}
                                />
                              </div>
                              <div>
                                <label className="h-eyebrow">Max characters</label>
                                <input
                                  type="number" min={1}
                                  className="input mt-1"
                                  value={d.validation?.maxLength ?? ''}
                                  onChange={(e) => updateValidation(d._id, { maxLength: e.target.value === '' ? undefined : Number(e.target.value) })}
                                />
                              </div>
                              <div className="md:col-span-2">
                                <details className="group rounded-md border border-paper-200 bg-paper-50/50 p-3">
                                  <summary className="cursor-pointer select-none text-xs font-medium uppercase tracking-[0.14em] text-paper-500 group-open:text-ink">
                                    Custom validation pattern
                                  </summary>
                                  <p className="mt-2 text-xs text-paper-500">
                                    For advanced users. Enter a regular expression the answer must match — e.g. <span className="font-mono">^[A-Z]{'{2}'}\d{'{4}'}$</span> for a ticket code like <span className="font-mono">AB1234</span>. Leave blank if unsure.
                                  </p>
                                  <div className="mt-3 grid gap-3">
                                    <div>
                                      <label className="h-eyebrow">Pattern</label>
                                      <input
                                        className="input mt-1 font-mono"
                                        placeholder="^[A-Z]{2}\d{4}$"
                                        value={d.validation?.pattern ?? ''}
                                        onChange={(e) => updateValidation(d._id, { pattern: e.target.value || undefined })}
                                      />
                                    </div>
                                    <div>
                                      <label className="h-eyebrow">Message shown when it doesn’t match</label>
                                      <input
                                        className="input mt-1"
                                        placeholder="Two letters followed by 4 digits"
                                        value={d.validation?.patternHint ?? ''}
                                        onChange={(e) => updateValidation(d._id, { patternHint: e.target.value || undefined })}
                                      />
                                    </div>
                                  </div>
                                </details>
                              </div>
                            </>
                          ) : null}

                          {d.fieldType === 'multiselect' ? (
                            <>
                              <div>
                                <label className="h-eyebrow">Pick at least</label>
                                <input
                                  type="number" min={0}
                                  className="input mt-1"
                                  value={d.validation?.minItems ?? ''}
                                  onChange={(e) => updateValidation(d._id, { minItems: e.target.value === '' ? undefined : Number(e.target.value) })}
                                />
                              </div>
                              <div>
                                <label className="h-eyebrow">Pick at most</label>
                                <input
                                  type="number" min={1}
                                  className="input mt-1"
                                  value={d.validation?.maxItems ?? ''}
                                  onChange={(e) => updateValidation(d._id, { maxItems: e.target.value === '' ? undefined : Number(e.target.value) })}
                                />
                              </div>
                            </>
                          ) : null}

                          <div className="md:col-span-2">
                            <label className="h-eyebrow">Internal name</label>
                            <input
                              className="input mt-1 font-mono"
                              value={d.fieldKey}
                              onChange={(e) => update(d._id, { fieldKey: e.target.value.toLowerCase() })}
                            />
                            <div className="mt-1 text-xs text-paper-500">
                              Used in CSV exports and integrations. Lowercase letters, numbers, and underscores.
                              {d.fieldKey !== keyify(d.label) && d.label ? (
                                <>
                                  {' '}
                                  <button
                                    type="button"
                                    onClick={() => update(d._id, { fieldKey: keyify(d.label) })}
                                    className="text-ink underline underline-offset-2"
                                  >
                                    Match to question → {keyify(d.label)}
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
          {drafts.length === 0 ? (
            <div className="rounded-md border border-dashed border-paper-300 p-8 text-center text-paper-500">
              No fields yet. <button onClick={() => setLibraryOpen(true)} className="text-ink underline underline-offset-2">Add the first one</button>.
            </div>
          ) : null}
        </div>
      )}

      {msg ? <p className="mt-4 text-sm text-accent-700">{msg}</p> : null}
      {err ? <p className="mt-4 text-sm text-red-700">{err}</p> : null}

      <LibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onAdd={addFromLibrary}
        onAddCustom={() => { setLibraryOpen(false); addField(); }}
        addedIds={addedFromLibrary}
      />
    </div>
  );
}
