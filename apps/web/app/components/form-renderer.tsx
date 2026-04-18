'use client';
import type { FormField } from '@butterbook/shared';

function HelpText({ field }: { field: FormField }) {
  const hint = field.helpText ?? field.validation?.patternHint;
  if (!hint) return null;
  return <div className="mt-1 text-xs text-paper-500">{hint}</div>;
}

export function FormRenderer({
  fields,
  values,
  onChange,
  errors,
}: {
  fields: FormField[];
  values: Record<string, unknown>;
  onChange: (key: string, v: unknown) => void;
  errors?: Record<string, string>;
}) {
  return (
    <div className="space-y-4">
      {[...fields].sort((a, b) => a.displayOrder - b.displayOrder).map((f) => {
        const err = errors?.[f.fieldKey];
        const raw = values[f.fieldKey];
        const placeholder = f.placeholder;

        const labelEl = (
          <label className="mb-1 block text-sm font-medium text-paper-800">
            {f.label}
            {f.required ? <span className="ml-1 text-brand-accent">*</span> : null}
          </label>
        );

        let control: React.ReactNode = null;
        switch (f.fieldType) {
          case 'text':
          case 'email':
          case 'phone':
          case 'url': {
            const inputType =
              f.fieldType === 'email' ? 'email' :
              f.fieldType === 'url' ? 'url' :
              f.fieldType === 'phone' ? 'tel' : 'text';
            control = (
              <input
                type={inputType}
                className="input"
                placeholder={placeholder}
                value={String(raw ?? '')}
                onChange={(e) => onChange(f.fieldKey, e.target.value)}
              />
            );
            break;
          }
          case 'textarea':
            control = (
              <textarea
                className="input min-h-[88px]"
                placeholder={placeholder}
                value={String(raw ?? '')}
                onChange={(e) => onChange(f.fieldKey, e.target.value)}
              />
            );
            break;
          case 'number':
            control = (
              <input
                type="number"
                className="input"
                placeholder={placeholder}
                step={f.validation?.integer ? 1 : 'any'}
                value={raw != null ? String(raw) : ''}
                onChange={(e) => onChange(f.fieldKey, e.target.value === '' ? undefined : Number(e.target.value))}
              />
            );
            break;
          case 'date':
            control = (
              <input
                type="date"
                className="input"
                value={String(raw ?? '')}
                onChange={(e) => onChange(f.fieldKey, e.target.value || undefined)}
              />
            );
            break;
          case 'time':
            control = (
              <input
                type="time"
                className="input"
                value={String(raw ?? '')}
                onChange={(e) => onChange(f.fieldKey, e.target.value || undefined)}
              />
            );
            break;
          case 'select':
            control = (
              <select
                className="input"
                value={String(raw ?? '')}
                onChange={(e) => onChange(f.fieldKey, e.target.value || undefined)}
              >
                <option value="">—</option>
                {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            );
            break;
          case 'radio':
            control = (
              <div className="flex flex-wrap gap-4 pt-1">
                {(f.options ?? []).map((o) => (
                  <label key={o} className="flex items-center gap-2 text-sm text-paper-700">
                    <input
                      type="radio"
                      name={f.fieldKey}
                      className="h-4 w-4 border-paper-300"
                      checked={raw === o}
                      onChange={() => onChange(f.fieldKey, o)}
                    />
                    <span>{o}</span>
                  </label>
                ))}
              </div>
            );
            break;
          case 'multiselect': {
            const arr: string[] = Array.isArray(raw) ? (raw as string[]) : [];
            control = (
              <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
                {(f.options ?? []).map((o) => {
                  const checked = arr.includes(o);
                  return (
                    <label key={o} className="flex items-center gap-2 text-sm text-paper-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-paper-300"
                        checked={checked}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...arr.filter((v) => v !== o), o]
                            : arr.filter((v) => v !== o);
                          onChange(f.fieldKey, next);
                        }}
                      />
                      <span>{o}</span>
                    </label>
                  );
                })}
              </div>
            );
            break;
          }
          case 'checkbox':
            return (
              <div key={f.fieldKey}>
                <label className="flex items-center gap-2 text-sm text-paper-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-paper-300"
                    checked={Boolean(raw)}
                    onChange={(e) => onChange(f.fieldKey, e.target.checked)}
                  />
                  <span>
                    {f.label}
                    {f.required ? <span className="ml-1 text-brand-accent">*</span> : null}
                  </span>
                </label>
                <HelpText field={f} />
                {err ? <div className="mt-1 text-xs text-red-700">{err}</div> : null}
              </div>
            );
        }

        return (
          <div key={f.fieldKey}>
            {labelEl}
            {control}
            <HelpText field={f} />
            {err ? <div className="mt-1 text-xs text-red-700">{err}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
