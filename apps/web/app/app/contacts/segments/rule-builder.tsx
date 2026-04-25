'use client';
import type { SegmentFilter } from '../types';

const MAX_DEPTH = 2;
const MAX_CHILDREN = 20;

type LeafKind = 'tag' | 'emailDomain' | 'visitedAfter' | 'visitedBefore' | 'hasMembership';

const LEAF_LABELS: Record<LeafKind, string> = {
  tag: 'Tag',
  emailDomain: 'Email domain',
  visitedAfter: 'Visited after',
  visitedBefore: 'Visited before',
  hasMembership: 'Membership',
};

export function isGroup(f: SegmentFilter): f is { and: SegmentFilter[] } | { or: SegmentFilter[] } {
  return 'and' in f || 'or' in f;
}

function leafKind(f: SegmentFilter): LeafKind | null {
  if ('tag' in f) return 'tag';
  if ('emailDomain' in f) return 'emailDomain';
  if ('visitedAfter' in f) return 'visitedAfter';
  if ('visitedBefore' in f) return 'visitedBefore';
  if ('hasMembership' in f) return 'hasMembership';
  return null;
}

function groupOp(f: { and: SegmentFilter[] } | { or: SegmentFilter[] }): 'and' | 'or' {
  return 'and' in f ? 'and' : 'or';
}

function groupChildren(f: { and: SegmentFilter[] } | { or: SegmentFilter[] }): SegmentFilter[] {
  return 'and' in f ? f.and : f.or;
}

function makeGroup(op: 'and' | 'or', children: SegmentFilter[]): SegmentFilter {
  return op === 'and' ? { and: children } : { or: children };
}

function defaultLeaf(kind: LeafKind): SegmentFilter {
  switch (kind) {
    case 'tag': return { tag: '' };
    case 'emailDomain': return { emailDomain: '' };
    case 'visitedAfter': return { visitedAfter: new Date().toISOString() };
    case 'visitedBefore': return { visitedBefore: new Date().toISOString() };
    case 'hasMembership': return { hasMembership: true };
  }
}

/** Wrap a leaf in an "and" group so the editor always has a group at the root. */
export function ensureGroup(f: SegmentFilter): { and: SegmentFilter[] } | { or: SegmentFilter[] } {
  if (isGroup(f)) return f;
  return { and: [f] };
}

/** If a top-level group has exactly one leaf child, unwrap it for the API. */
export function simplify(f: SegmentFilter): SegmentFilter {
  if (!isGroup(f)) return f;
  const kids = groupChildren(f).map(simplify);
  if (kids.length === 1 && !isGroup(kids[0])) return kids[0];
  return makeGroup(groupOp(f), kids);
}

function dateInputValue(iso: string): string {
  if (!iso) return new Date().toISOString().slice(0, 10);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function LeafEditor({
  filter,
  onChange,
}: {
  filter: SegmentFilter;
  onChange: (next: SegmentFilter) => void;
}) {
  const kind = leafKind(filter);
  if (!kind) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="input min-w-[10rem] flex-none"
        value={kind}
        onChange={(e) => onChange(defaultLeaf(e.target.value as LeafKind))}
      >
        {(Object.keys(LEAF_LABELS) as LeafKind[]).map((k) => (
          <option key={k} value={k}>{LEAF_LABELS[k]}</option>
        ))}
      </select>

      {kind === 'tag' ? (
        <input
          className="input min-w-0 flex-1"
          required
          value={'tag' in filter ? filter.tag : ''}
          onChange={(e) => onChange({ tag: e.target.value })}
          placeholder="member"
        />
      ) : null}

      {kind === 'emailDomain' ? (
        <input
          className="input min-w-0 flex-1"
          required
          value={'emailDomain' in filter ? filter.emailDomain : ''}
          onChange={(e) => onChange({ emailDomain: e.target.value.replace(/^@/, '') })}
          placeholder="example.org"
        />
      ) : null}

      {kind === 'visitedAfter' ? (
        <input
          className="input min-w-0 flex-1"
          type="date"
          required
          title="Start of day, local browser time"
          value={'visitedAfter' in filter ? dateInputValue(filter.visitedAfter) : ''}
          onChange={(e) =>
            onChange({ visitedAfter: new Date(`${e.target.value}T00:00:00`).toISOString() })
          }
        />
      ) : null}

      {kind === 'visitedBefore' ? (
        <input
          className="input min-w-0 flex-1"
          type="date"
          required
          title="End of day, local browser time"
          value={'visitedBefore' in filter ? dateInputValue(filter.visitedBefore) : ''}
          onChange={(e) =>
            onChange({ visitedBefore: new Date(`${e.target.value}T23:59:59`).toISOString() })
          }
        />
      ) : null}

      {kind === 'hasMembership' ? (
        <select
          className="input min-w-0 flex-1"
          value={'hasMembership' in filter ? String(filter.hasMembership) : 'true'}
          onChange={(e) => onChange({ hasMembership: e.target.value === 'true' })}
        >
          <option value="true">Has membership</option>
          <option value="false">Does not have membership</option>
        </select>
      ) : null}
    </div>
  );
}

function GroupEditor({
  group,
  onChange,
  onRemove,
  depth,
}: {
  group: { and: SegmentFilter[] } | { or: SegmentFilter[] };
  onChange: (next: { and: SegmentFilter[] } | { or: SegmentFilter[] }) => void;
  onRemove?: () => void;
  depth: number;
}) {
  const op = groupOp(group);
  const kids = groupChildren(group);

  function setOp(nextOp: 'and' | 'or') {
    if (nextOp === op) return;
    const g = makeGroup(nextOp, kids);
    onChange(g as { and: SegmentFilter[] } | { or: SegmentFilter[] });
  }

  function setChild(idx: number, child: SegmentFilter) {
    const next = kids.map((c, i) => (i === idx ? child : c));
    onChange(makeGroup(op, next) as { and: SegmentFilter[] } | { or: SegmentFilter[] });
  }

  function removeChild(idx: number) {
    const next = kids.filter((_, i) => i !== idx);
    if (next.length === 0) {
      if (onRemove) onRemove();
      else onChange(makeGroup(op, [defaultLeaf('tag')]) as { and: SegmentFilter[] } | { or: SegmentFilter[] });
      return;
    }
    onChange(makeGroup(op, next) as { and: SegmentFilter[] } | { or: SegmentFilter[] });
  }

  function addRule() {
    if (kids.length >= MAX_CHILDREN) return;
    onChange(makeGroup(op, [...kids, defaultLeaf('tag')]) as { and: SegmentFilter[] } | { or: SegmentFilter[] });
  }

  function addGroup() {
    if (kids.length >= MAX_CHILDREN || depth >= MAX_DEPTH) return;
    const sub: SegmentFilter = { and: [defaultLeaf('tag')] };
    onChange(makeGroup(op, [...kids, sub]) as { and: SegmentFilter[] } | { or: SegmentFilter[] });
  }

  const containerClass = depth === 0
    ? ''
    : 'rounded-md border border-paper-200 bg-paper-50/50 p-3';

  return (
    <div className={containerClass}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-paper-600">
          <span>Match</span>
          <div className="inline-flex overflow-hidden rounded-md border border-paper-200">
            <button
              type="button"
              onClick={() => setOp('and')}
              className={`px-2 py-1 text-xs font-medium transition ${
                op === 'and' ? 'bg-ink text-paper-50' : 'bg-paper-50 text-paper-600 hover:bg-paper-100'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setOp('or')}
              className={`px-2 py-1 text-xs font-medium transition ${
                op === 'or' ? 'bg-ink text-paper-50' : 'bg-paper-50 text-paper-600 hover:bg-paper-100'
              }`}
            >
              Any
            </button>
          </div>
          <span>of the following:</span>
        </div>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-paper-500 transition hover:text-red-700"
            aria-label="Remove group"
          >
            Remove group
          </button>
        ) : null}
      </div>

      <div className="mt-3 space-y-2">
        {kids.map((child, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {isGroup(child) ? (
                <GroupEditor
                  group={child}
                  onChange={(next) => setChild(idx, next)}
                  onRemove={() => removeChild(idx)}
                  depth={depth + 1}
                />
              ) : (
                <LeafEditor filter={child} onChange={(next) => setChild(idx, next)} />
              )}
            </div>
            {!isGroup(child) ? (
              <button
                type="button"
                onClick={() => removeChild(idx)}
                className="mt-1 shrink-0 rounded-md p-1.5 text-paper-400 transition hover:bg-paper-100 hover:text-red-700"
                aria-label="Remove rule"
                title="Remove rule"
              >
                <span aria-hidden>×</span>
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={addRule}
          disabled={kids.length >= MAX_CHILDREN}
          className="btn-ghost text-xs disabled:opacity-40"
        >
          + Add rule
        </button>
        {depth < MAX_DEPTH ? (
          <button
            type="button"
            onClick={addGroup}
            disabled={kids.length >= MAX_CHILDREN}
            className="btn-ghost text-xs disabled:opacity-40"
          >
            + Add group
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function RuleBuilder({
  filter,
  onChange,
}: {
  filter: SegmentFilter;
  onChange: (next: SegmentFilter) => void;
}) {
  const group = ensureGroup(filter);
  return (
    <GroupEditor
      group={group}
      onChange={(next) => onChange(next)}
      depth={0}
    />
  );
}
