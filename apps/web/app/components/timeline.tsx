'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import type { FormField } from '@butterbook/shared';
import { apiGet } from '../../lib/api';
import { useSession } from '../../lib/session';

/**
 * Inline mirror of `getPrimaryLabel` from `@butterbook/shared`. Shared package
 * re-exports use `.js` suffixes that Next's bundler won't resolve for runtime
 * values — type-only imports are fine (erased), but this helper needs to run,
 * so we duplicate the small amount of logic here.
 */
function getPrimaryLabel(fields: FormField[], response: Record<string, unknown>): string | null {
  const tryVal = (key: string): string | null => {
    const v = response[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
    return null;
  };
  const primary = fields.find((f) => f.isPrimaryLabel);
  if (primary) { const v = tryVal(primary.fieldKey); if (v) return v; }
  if ('name' in response) { const v = tryVal('name'); if (v) return v; }
  const firstText = fields.find((f) => f.fieldType === 'text' || f.fieldType === 'textarea' || f.fieldType === 'email');
  if (firstText) { const v = tryVal(firstText.fieldKey); if (v) return v; }
  return null;
}

export interface TimelineVisit {
  id: string;
  scheduledAt: string;
  status: 'confirmed' | 'cancelled' | 'no_show' | string;
  bookingMethod: string;
  piiRedacted: boolean;
  formResponse: Record<string, unknown>;
  /** Free-form admin labels. Always an array — missing server-side = []. */
  tags?: string[];
}

const BASE_HOUR_HEIGHT = 96; // more vertical breathing room
const CARD_MINUTES = 45;

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function fmtHour(h: number): string {
  const hr = h % 12 === 0 ? 12 : h % 12;
  const ap = h < 12 ? 'am' : 'pm';
  return `${hr}${ap}`;
}

function methodTag(m: string): string {
  if (m === 'kiosk') return 'Kiosk';
  if (m === 'self') return 'Web';
  return 'Admin';
}

function statusLeftBar(s: string): string {
  if (s === 'cancelled') return 'bg-paper-300';
  if (s === 'no_show') return 'bg-amber-500';
  return 'bg-brand-accent';
}

export interface TimelineHandlers {
  onCancel?: (id: string) => void;
  onNoShow?: (id: string) => void;
  onReconfirm?: (id: string) => void;
  onEdit?: (visit: TimelineVisit) => void;
  /** Persists the full replacement tag list (add, rename, remove). */
  onTagsChange?: (id: string, next: string[]) => void;
}

export function Timeline({
  date,
  visits,
  fields,
  startHour = 9,
  endHour = 18,
  onCancel,
  onNoShow,
  onReconfirm,
  onEdit,
  onTagsChange,
  zoom = 1,
}: {
  date: Date;
  visits: TimelineVisit[];
  /** Form field schema — used to resolve the per-visit display label. */
  fields?: FormField[];
  /** First hour (0–24) shown at the top of the grid. */
  startHour?: number;
  /** Last hour (0–24) shown at the bottom of the grid. Must be > startHour. */
  endHour?: number;
  /** Vertical zoom factor. Scales hour row height so scroll + hit-testing
   *  stay accurate (unlike CSS `zoom`, which distorts layout math). */
  zoom?: number;
} & TimelineHandlers) {
  const START_HOUR = startHour;
  const END_HOUR = endHour;
  const TOTAL_HOURS = Math.max(1, END_HOUR - START_HOUR);
  const HOUR_HEIGHT = BASE_HOUR_HEIGHT * zoom;

  const topFor = (d: Date): number => {
    const h = d.getHours() + d.getMinutes() / 60;
    return (h - START_HOUR) * HOUR_HEIGHT;
  };
  const [now, setNow] = useState(() => new Date());
  const scrollRef = useRef<HTMLDivElement>(null);
  const didScrollRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (didScrollRef.current) return;
    if (!scrollRef.current) return;
    if (!isSameDay(now, date)) return;
    scrollRef.current.scrollTo({ top: Math.max(0, topFor(now) - 140), behavior: 'auto' });
    didScrollRef.current = true;
  }, [now, date]);

  const showNow = isSameDay(now, date);
  const nowTop = topFor(now);

  // Group overlapping visits into lanes
  const sorted = [...visits].sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const laneMap: Record<string, number> = {};
  const laneEnds: number[] = [];
  for (const v of sorted) {
    const start = new Date(v.scheduledAt).getTime();
    const end = start + CARD_MINUTES * 60 * 1000;
    let assigned = -1;
    for (let i = 0; i < laneEnds.length; i++) {
      if (laneEnds[i]! <= start) { assigned = i; break; }
    }
    if (assigned === -1) { assigned = laneEnds.length; laneEnds.push(end); }
    else { laneEnds[assigned] = end; }
    laneMap[v.id] = assigned;
  }
  const laneCount = Math.max(1, laneEnds.length);

  return (
    <div ref={scrollRef} className="relative overflow-y-auto pt-3" style={{ maxHeight: 'calc(100vh - 220px)' }}>
      <div className="relative" style={{ height: TOTAL_HOURS * HOUR_HEIGHT + 24 }}>
        {/* Hour labels + lines */}
        {Array.from({ length: TOTAL_HOURS + 1 }).map((_, i) => {
          const h = START_HOUR + i;
          return (
            <div key={h} className="absolute left-0 right-0" style={{ top: i * HOUR_HEIGHT }}>
              <div className="absolute left-20 right-0 top-0 border-t border-paper-200" />
              <div
                className="-mt-2 w-16 pr-3 text-right font-display text-paper-500"
                style={{ fontSize: `${12 * zoom}px` }}
              >
                {fmtHour(h)}
              </div>
            </div>
          );
        })}

        {/* Half-hour dashes */}
        {Array.from({ length: TOTAL_HOURS }).map((_, i) => (
          <div
            key={`h-${i}`}
            className="absolute left-20 right-0 border-t border-dashed border-paper-100"
            style={{ top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
          />
        ))}

        {/* Now indicator — the label sits in its own pill above the line so it
            doesn't look like the horizontal line is crossing it out. */}
        {showNow && nowTop >= 0 && nowTop <= TOTAL_HOURS * HOUR_HEIGHT ? (
          <div className="pointer-events-none absolute left-16 right-0 z-20" style={{ top: nowTop }}>
            <div className="relative">
              <div className="absolute -left-1 -top-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand-accent" />
              <div className="h-px bg-brand-accent/80" />
              <div className="absolute -top-[9px] right-2 rounded-full border border-brand-accent/30 bg-paper-50 px-1.5 py-px font-display text-[11px] italic leading-none text-brand-accent shadow-[0_0_0_3px_rgb(251_250_247)]">
                now · {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase()}
              </div>
            </div>
          </div>
        ) : null}

        {/* Visits */}
        <div className="absolute inset-0 left-20 pr-4">
          {sorted.map((v) => {
            const d = new Date(v.scheduledAt);
            if (!isSameDay(d, date)) return null;
            const top = topFor(d);
            if (top < 0 || top > TOTAL_HOURS * HOUR_HEIGHT) return null;
            const lane = laneMap[v.id] ?? 0;
            const widthPct = 100 / laneCount;
            const leftPct = widthPct * lane;
            return (
              <VisitCard
                key={v.id}
                visit={v}
                fields={fields ?? []}
                zoom={zoom}
                style={{
                  top: top + 3,
                  height: (CARD_MINUTES / 60) * HOUR_HEIGHT - 6,
                  left: `calc(${leftPct}% + 6px)`,
                  width: `calc(${widthPct}% - 12px)`,
                }}
                handlers={{
                  ...(onCancel ? { onCancel } : {}),
                  ...(onNoShow ? { onNoShow } : {}),
                  ...(onReconfirm ? { onReconfirm } : {}),
                  ...(onEdit ? { onEdit } : {}),
                  ...(onTagsChange ? { onTagsChange } : {}),
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- VisitCard ---------- */

function VisitCard({
  visit,
  fields,
  style,
  handlers,
  zoom,
}: {
  visit: TimelineVisit;
  fields: FormField[];
  style: React.CSSProperties;
  handlers: TimelineHandlers;
  zoom: number;
}) {
  const d = new Date(visit.scheduledAt);
  const name = visit.piiRedacted
    ? '[redacted]'
    : (getPrimaryLabel(fields, visit.formResponse) ?? 'Unknown');
  const partyRaw = visit.formResponse.party_size;
  const party = partyRaw != null ? String(partyRaw) : null;
  const dim = visit.status === 'cancelled';
  const tags = visit.tags ?? [];

  const cardRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  function openMenu() {
    const r = cardRef.current?.getBoundingClientRect() ?? null;
    setAnchorRect(r);
    setMenuOpen(true);
  }
  function openTagPopover() {
    const r = cardRef.current?.getBoundingClientRect() ?? null;
    setAnchorRect(r);
    setTagPopoverOpen(true);
  }

  function removeTag(tag: string) {
    if (!handlers.onTagsChange) return;
    handlers.onTagsChange(visit.id, tags.filter((t) => t !== tag));
  }

  function addTag(raw: string) {
    const next = raw.trim();
    if (!next) return;
    if (tags.some((t) => t.toLowerCase() === next.toLowerCase())) return;
    if (!handlers.onTagsChange) return;
    handlers.onTagsChange(visit.id, [...tags, next]);
  }

  return (
    <div
      ref={cardRef}
      className={`group absolute flex rounded-md bg-white transition hover:ring-1 hover:ring-paper-300 ${dim ? 'opacity-60' : ''}`}
      style={{ ...style, fontSize: `${15 * zoom}px` }}
    >
      <div className={`w-1 shrink-0 rounded-l-md ${statusLeftBar(visit.status)}`} />
      <div className="flex min-w-0 flex-1 items-start justify-between gap-[0.53em] px-[0.8em] py-[0.53em]">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-[0.53em]">
            <span className="font-display text-[0.93em] font-medium tabular-nums text-paper-700">
              {d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase()}
            </span>
            <span className="text-[0.67em] uppercase tracking-wider text-paper-400">{methodTag(visit.bookingMethod)}</span>
            {visit.status !== 'confirmed' ? (
              <span className="text-[0.67em] uppercase tracking-wider text-paper-500">· {visit.status.replace('_', ' ')}</span>
            ) : null}
          </div>
          <div className="mt-[0.13em] truncate text-[1em] font-medium text-ink">{name}</div>
          <div className="mt-[0.13em] flex items-center gap-[0.4em] text-[0.8em] text-paper-500">
            {party ? <span>Party of {party}</span> : null}
            {party && tags.length ? <span className="text-paper-300">·</span> : null}
            {tags.length ? (
              <div className="flex min-w-0 flex-wrap gap-[0.33em]">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="group/tag inline-flex items-center gap-[0.33em] rounded-full bg-brand-accent/10 px-[0.5em] py-[0.17em] text-[0.83em] font-medium text-brand-accent"
                  >
                    {t}
                    {handlers.onTagsChange ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeTag(t); }}
                        className="text-brand-accent/50 opacity-0 transition hover:text-brand-accent group-hover/tag:opacity-100"
                        aria-label={`Remove tag ${t}`}
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-[0.13em] opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
          {handlers.onTagsChange ? (
            <button
              type="button"
              onClick={openTagPopover}
              className="btn-ghost px-[0.4em] text-[0.73em]"
              title="Add a tag"
              aria-label="Add a tag"
            >
              #
            </button>
          ) : null}
          <button
            type="button"
            onClick={openMenu}
            className="btn-ghost px-[0.4em] text-[0.93em] leading-none"
            title="More actions"
            aria-label="More actions"
          >
            ⋯
          </button>
        </div>
      </div>

      {menuOpen && anchorRect ? (
        <ActionMenu
          anchor={anchorRect}
          onClose={() => setMenuOpen(false)}
          visit={visit}
          handlers={handlers}
        />
      ) : null}
      {tagPopoverOpen && anchorRect ? (
        <TagPopover
          anchor={anchorRect}
          onClose={() => setTagPopoverOpen(false)}
          existing={tags}
          onAdd={addTag}
        />
      ) : null}
    </div>
  );
}

/* ---------- ActionMenu (portal popover) ---------- */

function ActionMenu({
  anchor,
  onClose,
  visit,
  handlers,
}: {
  anchor: DOMRect;
  onClose: () => void;
  visit: TimelineVisit;
  handlers: TimelineHandlers;
}) {
  // Close on outside click / escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    function onClick() { onClose(); }
    window.addEventListener('keydown', onKey);
    // Run on next tick so the opening click doesn't immediately close us.
    const h = setTimeout(() => window.addEventListener('click', onClick), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
      clearTimeout(h);
    };
  }, [onClose]);

  const items: Array<{ label: string; onSelect: () => void; danger?: boolean }> = [];
  if (handlers.onEdit) {
    items.push({ label: 'Edit details…', onSelect: () => handlers.onEdit!(visit) });
  }
  if (visit.status !== 'confirmed' && handlers.onReconfirm) {
    items.push({ label: 'Reconfirm', onSelect: () => handlers.onReconfirm!(visit.id) });
  }
  if (visit.status === 'confirmed' && handlers.onNoShow) {
    items.push({ label: 'Mark no-show', onSelect: () => handlers.onNoShow!(visit.id) });
  }
  if (visit.status !== 'cancelled' && handlers.onCancel) {
    items.push({ label: 'Cancel visit', onSelect: () => handlers.onCancel!(visit.id), danger: true });
  }

  if (items.length === 0) return null;

  // Anchor to the card's top-right corner; flip left if we'd overflow viewport.
  const estWidth = 176;
  const left = Math.min(anchor.right - estWidth, window.innerWidth - estWidth - 8);
  const top = anchor.top + 6;

  return createPortal(
    <div
      role="menu"
      onClick={(e) => e.stopPropagation()}
      style={{ position: 'fixed', left: Math.max(8, left), top, width: estWidth }}
      className="z-[60] overflow-hidden rounded-md border border-paper-200 bg-white py-1 shadow-[0_12px_32px_rgb(0_0_0/0.14)]"
    >
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          onClick={() => { it.onSelect(); onClose(); }}
          className={`block w-full px-3 py-1.5 text-left text-sm transition hover:bg-paper-50 ${
            it.danger ? 'text-red-700 hover:bg-red-50' : 'text-ink'
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}

/* ---------- TagPopover (portal popover with typeahead) ---------- */

interface TagSuggestion { tag: string; count: number }

function TagPopover({
  anchor,
  onClose,
  existing,
  onAdd,
}: {
  anchor: DOMRect;
  onClose: () => void;
  existing: string[];
  onAdd: (t: string) => void;
}) {
  const { activeOrgId } = useSession();
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useQuery({
    queryKey: ['visit-tag-suggestions', activeOrgId],
    queryFn: () =>
      apiGet<{ data: TagSuggestion[] }>(`/api/v1/orgs/${activeOrgId}/visits/tag-suggestions`),
    enabled: !!activeOrgId,
    staleTime: 30_000,
  });

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    function onClick() { onClose(); }
    window.addEventListener('keydown', onKey);
    const h = setTimeout(() => window.addEventListener('click', onClick), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
      clearTimeout(h);
    };
  }, [onClose]);

  const lower = q.trim().toLowerCase();
  const existingLower = new Set(existing.map((t) => t.toLowerCase()));
  const matches = (suggestions.data?.data ?? [])
    .filter((s) => !existingLower.has(s.tag.toLowerCase()))
    .filter((s) => (lower ? s.tag.toLowerCase().includes(lower) : true))
    .slice(0, 6);
  const canCreate =
    lower.length > 0 &&
    !existingLower.has(lower) &&
    !matches.some((m) => m.tag.toLowerCase() === lower);

  const estWidth = 224;
  const left = Math.min(anchor.right - estWidth, window.innerWidth - estWidth - 8);
  const top = anchor.top + 6;

  function submit(t: string) {
    onAdd(t);
    onClose();
  }

  return createPortal(
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ position: 'fixed', left: Math.max(8, left), top, width: estWidth }}
      className="z-[60] overflow-hidden rounded-md border border-paper-200 bg-white shadow-[0_12px_32px_rgb(0_0_0/0.14)]"
    >
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (matches[0]) submit(matches[0].tag);
            else if (canCreate) submit(q.trim());
          }
        }}
        placeholder="Add a tag…"
        maxLength={32}
        className="block w-full border-b border-paper-200 px-3 py-2 text-sm outline-none placeholder:text-paper-400"
      />
      <div className="max-h-56 overflow-y-auto py-1">
        {canCreate ? (
          <Row onClick={() => submit(q.trim())}>
            <span>Create </span>
            <span className="ml-1 rounded-full bg-brand-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-brand-accent">
              {q.trim()}
            </span>
          </Row>
        ) : null}
        {matches.length === 0 && !canCreate && q.length === 0 ? (
          <div className="px-3 py-2 text-xs text-paper-500">Type to add a tag.</div>
        ) : null}
        {matches.map((s) => (
          <Row key={s.tag} onClick={() => submit(s.tag)}>
            <span className="truncate text-ink">{s.tag}</span>
            <span className="ml-auto text-[11px] text-paper-400">{s.count}</span>
          </Row>
        ))}
      </div>
    </div>,
    document.body,
  );
}

function Row({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition hover:bg-paper-50"
    >
      {children}
    </button>
  );
}
