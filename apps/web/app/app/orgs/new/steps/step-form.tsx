'use client';
import { useState } from 'react';
import type { FieldLibraryEntry, FieldType, FormField } from '@butterbook/shared';
import type { StepProps } from '../types';
import { toFieldKey, uniqueFieldKey } from '../../../../../lib/unique-field-key';
import { LibraryModal } from '../../../../components/field-library-modal';

const FIELD_TYPES: Array<{ value: FieldType; label: string }> = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'url', label: 'URL' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'time', label: 'Time' },
  { value: 'select', label: 'Dropdown' },
  { value: 'multiselect', label: 'Multi-select' },
  { value: 'radio', label: 'Radio buttons' },
  { value: 'checkbox', label: 'Checkbox' },
];

export function StepForm({ state, patch }: StepProps) {
  const { formFields } = state;
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  function updateField(idx: number, next: Partial<FormField>) {
    const copy = formFields.slice();
    copy[idx] = { ...copy[idx]!, ...next } as FormField;
    patch({ formFields: copy });
  }

  function removeField(idx: number) {
    const copy = formFields.slice();
    copy.splice(idx, 1);
    // Re-sequence displayOrder after removal.
    patch({ formFields: copy.map((f, i) => ({ ...f, displayOrder: i })) });
  }

  function moveField(idx: number, dir: -1 | 1) {
    const to = idx + dir;
    if (to < 0 || to >= formFields.length) return;
    const copy = formFields.slice();
    [copy[idx], copy[to]] = [copy[to]!, copy[idx]!];
    patch({ formFields: copy.map((f, i) => ({ ...f, displayOrder: i })) });
  }

  function addField(type: FieldType) {
    const labelBase = type === 'email' ? 'Email' : type === 'phone' ? 'Phone' : 'New question';
    const key = uniqueFieldKey(toFieldKey(labelBase), formFields);
    const next: FormField = {
      fieldKey: key,
      label: labelBase,
      fieldType: type,
      required: false,
      isSystem: false,
      isPrimaryLabel: false,
      displayOrder: formFields.length,
      ...(type === 'select' || type === 'radio' || type === 'multiselect'
        ? { options: ['Option 1', 'Option 2'] }
        : {}),
    };
    patch({ formFields: [...formFields, next] });
  }

  function addFromLibrary(entry: FieldLibraryEntry) {
    const key = uniqueFieldKey(entry.field.fieldKey, formFields);
    const alreadyHasPrimary = formFields.some((f) => f.isPrimaryLabel);
    const next: FormField = {
      ...entry.field,
      fieldKey: key,
      required: entry.field.required ?? false,
      isSystem: entry.field.isSystem ?? false,
      isPrimaryLabel: entry.field.isPrimaryLabel && !alreadyHasPrimary ? true : false,
      displayOrder: formFields.length,
    };
    patch({ formFields: [...formFields, next] });
    setAddedIds((s) => new Set(s).add(entry.id));
  }

  return (
    <div className="grid gap-5">
      <div>
        <div className="h-eyebrow">Intake form</div>
        <p className="mt-1 text-xs text-paper-500">
          What you ask visitors when they book. Start minimal — you can add or edit fields here or anytime from Settings → Form.
        </p>
      </div>

      <ul className="grid gap-3">
        {formFields.map((f, idx) => (
          <li key={f.fieldKey + idx} className="rounded-md border border-paper-200 bg-white p-4">
            <FieldRow
              field={f}
              onPatch={(p) => updateField(idx, p)}
              onRemove={() => removeField(idx)}
              onMoveUp={() => moveField(idx, -1)}
              onMoveDown={() => moveField(idx, 1)}
              canMoveUp={idx > 0}
              canMoveDown={idx < formFields.length - 1}
            />
          </li>
        ))}
      </ul>

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
        <button
          type="button"
          onClick={() => setLibraryOpen(true)}
          className="btn-ghost border border-dashed border-paper-300 w-full justify-center"
        >
          Browse library
        </button>
        <AddFieldMenu onAdd={addField} />
      </div>

      <LibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onAdd={addFromLibrary}
        addedIds={addedIds}
      />
    </div>
  );
}

function FieldRow({
  field,
  onPatch,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  field: FormField;
  onPatch: (p: Partial<FormField>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const needsOptions = field.fieldType === 'select' || field.fieldType === 'radio' || field.fieldType === 'multiselect';

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
        <label className="block">
          <span className="text-xs font-medium text-paper-600">Label</span>
          <input
            className="input mt-1"
            value={field.label}
            onChange={(e) => onPatch({ label: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-paper-600">Type</span>
          <select
            className="input mt-1"
            value={field.fieldType}
            onChange={(e) => onPatch({ fieldType: e.target.value as FieldType })}
          >
            {FIELD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="rounded-md border border-paper-200 px-2 py-1.5 text-xs text-paper-600 disabled:opacity-40"
            title="Move up"
            aria-label="Move field up"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="rounded-md border border-paper-200 px-2 py-1.5 text-xs text-paper-600 disabled:opacity-40"
            title="Move down"
            aria-label="Move field down"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md border border-paper-200 px-2 py-1.5 text-xs text-red-700 hover:border-red-300"
            title="Remove"
          >
            Remove
          </button>
        </div>
      </div>

      {needsOptions ? (
        <label className="block">
          <span className="text-xs font-medium text-paper-600">Options (one per line)</span>
          <textarea
            className="input mt-1 font-mono text-xs"
            rows={3}
            value={(field.options ?? []).join('\n')}
            onChange={(e) =>
              onPatch({ options: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })
            }
          />
        </label>
      ) : null}

      <div className="flex flex-wrap items-center gap-4 text-xs text-paper-600">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onPatch({ required: e.target.checked })}
          />
          Required
        </label>
        {field.fieldType !== 'checkbox' ? (
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={field.isPrimaryLabel ?? false}
              onChange={(e) => onPatch({ isPrimaryLabel: e.target.checked })}
            />
            Use as visitor display name
          </label>
        ) : null}
        <span className="ml-auto font-mono text-paper-400">{field.fieldKey}</span>
      </div>
    </div>
  );
}

function AddFieldMenu({ onAdd }: { onAdd: (t: FieldType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-ghost border border-dashed border-paper-300 w-full justify-center"
      >
        + Add a field
      </button>
      {open ? (
        <div
          className="absolute left-0 right-0 z-10 mt-1 grid max-h-64 grid-cols-2 gap-1 overflow-auto rounded-md border border-paper-200 bg-white p-1 shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          {FIELD_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => {
                onAdd(t.value);
                setOpen(false);
              }}
              className="rounded px-2 py-1.5 text-left text-sm hover:bg-paper-50"
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
