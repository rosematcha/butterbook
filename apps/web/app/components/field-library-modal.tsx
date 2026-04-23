'use client';
import { useMemo, useState } from 'react';
import {
  FIELD_LIBRARY,
  FIELD_LIBRARY_CATEGORIES,
  type FieldLibraryCategory,
  type FieldLibraryEntry,
  type FieldType,
} from '@butterbook/shared';
import { Modal } from './modal';

const TYPE_LABEL: Record<FieldType, string> = {
  text: 'Short text',
  textarea: 'Long text',
  number: 'Number',
  email: 'Email',
  phone: 'Phone',
  url: 'URL',
  date: 'Date',
  time: 'Time',
  select: 'Dropdown',
  multiselect: 'Multi-select',
  radio: 'Radio group',
  checkbox: 'Checkbox',
};

function typeBadge(entry: FieldLibraryEntry): string {
  const t = entry.field.fieldType;
  const label = TYPE_LABEL[t];
  if (t === 'select' || t === 'multiselect' || t === 'radio') {
    const count = entry.field.options?.length ?? 0;
    return `${label} · ${count} ${count === 1 ? 'option' : 'options'}`;
  }
  return label;
}

function matches(entry: FieldLibraryEntry, query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  if (entry.title.toLowerCase().includes(q)) return true;
  if (entry.description.toLowerCase().includes(q)) return true;
  if (entry.field.label.toLowerCase().includes(q)) return true;
  if (entry.field.fieldKey.toLowerCase().includes(q)) return true;
  return entry.keywords.some((k) => k.toLowerCase().includes(q));
}

export function LibraryModal({
  open,
  onClose,
  onAdd,
  addedIds,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (entry: FieldLibraryEntry) => void;
  addedIds: Set<string>;
}) {
  const [query, setQuery] = useState('');
  const allIds = useMemo(
    () => FIELD_LIBRARY_CATEGORIES.map((c) => c.id) as FieldLibraryCategory[],
    [],
  );
  const [selected, setSelected] = useState<Set<FieldLibraryCategory>>(new Set(allIds));

  const toggleCategory = (id: FieldLibraryCategory) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(allIds));
  const clearAll = () => setSelected(new Set());

  const visible = useMemo(
    () => FIELD_LIBRARY.filter((e) => selected.has(e.category) && matches(e, query)),
    [query, selected],
  );

  const groups = useMemo(() => {
    const out = new Map<FieldLibraryCategory, FieldLibraryEntry[]>();
    for (const entry of visible) {
      const arr = out.get(entry.category) ?? [];
      arr.push(entry);
      out.set(entry.category, arr);
    }
    return out;
  }, [visible]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow="Field library"
      title="Add a suggested field"
      wide
      footer={
        <>
          <span className="mr-auto self-center text-xs text-paper-500">
            {visible.length} suggestion{visible.length === 1 ? '' : 's'}
          </span>
          <button onClick={onClose} className="btn">Done</button>
        </>
      }
    >
      <div className="mb-4 space-y-3">
        <input
          autoFocus
          className="input"
          placeholder="Search — e.g. “email”, “waiver”, “dietary”…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          {FIELD_LIBRARY_CATEGORIES.map((c) => {
            const on = selected.has(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleCategory(c.id)}
                className={
                  'rounded-full border px-3 py-1 text-xs transition ' +
                  (on
                    ? 'border-ink bg-ink text-paper-50'
                    : 'border-paper-300 bg-white text-paper-600 hover:border-paper-400')
                }
                title={c.description}
              >
                {c.label}
              </button>
            );
          })}
          <div className="ml-auto flex gap-2 text-xs text-paper-500">
            <button type="button" onClick={selectAll} className="underline-offset-2 hover:underline">All</button>
            <span>·</span>
            <button type="button" onClick={clearAll} className="underline-offset-2 hover:underline">None</button>
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-md border border-dashed border-paper-300 p-8 text-center text-sm text-paper-500">
          No suggestions match. Try a different search or category.
        </div>
      ) : (
        <div className="space-y-6">
          {FIELD_LIBRARY_CATEGORIES.map((cat) => {
            const entries = groups.get(cat.id);
            if (!entries || entries.length === 0) return null;
            return (
              <section key={cat.id}>
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="text-xs font-medium uppercase tracking-[0.14em] text-paper-500">{cat.label}</h3>
                  <span className="text-xs text-paper-400">{cat.description}</span>
                </div>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {entries.map((entry) => {
                    const added = addedIds.has(entry.id);
                    return (
                      <li
                        key={entry.id}
                        className="flex items-start gap-3 rounded-md border border-paper-200 bg-white p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="truncate text-sm font-medium text-ink">{entry.title}</span>
                            {entry.field.required ? (
                              <span className="text-[10px] uppercase tracking-wider text-brand-accent">Required</span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-xs text-paper-500">{entry.description}</p>
                          <p className="mt-1 text-[11px] text-paper-400">{typeBadge(entry)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onAdd(entry)}
                          disabled={added}
                          className={
                            'shrink-0 rounded-md border px-2.5 py-1 text-xs transition ' +
                            (added
                              ? 'cursor-default border-paper-200 bg-paper-100 text-paper-400'
                              : 'border-ink bg-ink text-paper-50 hover:opacity-90')
                          }
                        >
                          {added ? 'Added' : 'Add'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
