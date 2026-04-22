'use client';

// A miniature of the Butterbook /app Today view. Used as a visual stand-in
// on marketing and info pages (/demo today; likely /pricing, /about, and
// future landing pages). The look matches the real app's styling — sidebar
// + day-view timeline — without being a live screenshot, so it stays fresh
// without a capture step.
//
// Defaults render today's date and rows sampled from the actual demo seed
// (`VISITOR_NAMES` + `TAGS_POOL` in apps/api/src/services/demo-seed.ts), so
// a visitor who clicks through to the real demo sees familiar data.
//
// Names are pre-abbreviated ("E. Rivera") because the mockup renders inside
// narrow grid columns on sub-pages. Tags stay short so the right-hand pill
// doesn't push the name into ellipsis.

import { useMemo } from 'react';

export interface MiniAppRow {
  time: string;
  /** Visitor name. Keep under ~18 chars when a tag is present. */
  name: string;
  partySize: number;
  status: 'ok' | 'cancelled';
  /** Optional accent pill to the right of the name. */
  tag?: string | null;
}

export interface MiniAppProps {
  /** Header label; defaults to today, formatted "Tuesday, April 21". */
  dateLabel?: string;
  /** Left count in the summary line. Defaults to 14. */
  confirmed?: number;
  /** Right count in the summary line. Defaults to 2. */
  cancelled?: number;
  /** Shows the "· event day" accent after the counts. */
  eventDay?: boolean;
  /** Sidebar active item. Defaults to 'Today'. */
  sidebarActive?: 'Today' | 'All visits' | 'Events';
  /** Timeline rows. Defaults to DEFAULT_MINI_APP_ROWS. */
  rows?: MiniAppRow[];
  /** Outer height in px. Defaults to 480. */
  height?: number;
  /** Optional override for the org name in the sidebar. */
  orgName?: string;
}

/**
 * Seed-accurate sample rows. Names are abbreviated to first-initial form so
 * the layout fits in a ~400px column without tag truncation. Tag labels use
 * the singular form from TAGS_POOL in the API seed.
 */
export const DEFAULT_MINI_APP_ROWS: MiniAppRow[] = [
  { time: '10:00', name: 'E. Rivera', partySize: 2, status: 'ok', tag: 'docent' },
  { time: '10:15', name: 'Okafor family', partySize: 4, status: 'ok', tag: 'member' },
  { time: '10:30', name: 'J. Bell', partySize: 1, status: 'ok', tag: null },
  { time: '10:45', name: 'A. Petrova', partySize: 3, status: 'cancelled', tag: null },
  { time: '11:00', name: 'Hayes Elem.', partySize: 22, status: 'ok', tag: 'school' },
  { time: '11:30', name: 'Lin-Park', partySize: 2, status: 'ok', tag: null },
  { time: '12:00', name: 'D. Nassar', partySize: 1, status: 'ok', tag: null },
  { time: '13:00', name: 'P. Shah', partySize: 4, status: 'ok', tag: 'member' },
];

const MAIN_NAV: Array<'Today' | 'All visits' | 'Events'> = ['Today', 'All visits', 'Events'];
const SETTINGS_NAV = ['Locations', 'Form fields', 'Members', 'Roles', 'Branding', 'Audit log'];

export function MiniApp({
  dateLabel,
  confirmed = 14,
  cancelled = 2,
  eventDay = false,
  sidebarActive = 'Today',
  rows = DEFAULT_MINI_APP_ROWS,
  height = 480,
  orgName = 'Butterbook',
}: MiniAppProps) {
  const resolvedDate = useMemo(() => {
    if (dateLabel) return dateLabel;
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  }, [dateLabel]);

  return (
    <div
      className="overflow-hidden rounded-xl border border-paper-200 shadow-[0_16px_40px_rgb(0_0_0/0.10),0_0_0_1px_rgb(0_0_0/0.03)]"
      style={{ height }}
    >
      <div className="flex h-full bg-paper-50 text-[13px]">
        <Sidebar active={sidebarActive} orgName={orgName} />
        <Main
          dateLabel={resolvedDate}
          confirmed={confirmed}
          cancelled={cancelled}
          eventDay={eventDay}
          rows={rows}
        />
      </div>
    </div>
  );
}

function Sidebar({ active, orgName }: { active: string; orgName: string }) {
  return (
    <div className="flex w-[160px] shrink-0 flex-col gap-[3px] border-r border-paper-200 bg-paper-100 px-3 py-[18px]">
      <div className="mb-3.5 flex items-center gap-[7px]">
        <span className="h-[7px] w-[7px] rounded-full bg-brand-accent" />
        <span className="font-display text-[14px] tracking-[-0.01em]">{orgName}</span>
      </div>
      {MAIN_NAV.map((label) => {
        const isActive = label === active;
        return (
          <div
            key={label}
            className={`relative flex items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-[12.5px] ${
              isActive
                ? 'border border-paper-200 bg-paper-50 font-medium text-ink'
                : 'text-paper-600'
            }`}
          >
            {isActive && (
              <span className="absolute bottom-2 left-0 top-2 w-0.5 rounded bg-brand-accent" />
            )}
            <NavGlyph label={label} />
            {label}
          </div>
        );
      })}
      <div className="px-2.5 pb-[5px] pt-3.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-paper-500">
        Settings
      </div>
      {SETTINGS_NAV.map((label) => (
        <div key={label} className="rounded-[7px] px-2.5 py-[5px] text-[12.5px] text-paper-600">
          {label}
        </div>
      ))}
    </div>
  );
}

function Main({
  dateLabel,
  confirmed,
  cancelled,
  eventDay,
  rows,
}: {
  dateLabel: string;
  confirmed: number;
  cancelled: number;
  eventDay: boolean;
  rows: MiniAppRow[];
}) {
  return (
    <div className="min-w-0 flex-1 overflow-hidden px-6 py-[22px]">
      <div className="font-display text-[26px] leading-tight tracking-[-0.025em]">{dateLabel}</div>
      <div className="mt-1 text-[12px] text-paper-600">
        <span className="tabular-nums">{confirmed}</span> confirmed ·{' '}
        <span className="tabular-nums">{cancelled}</span> cancelled
        {eventDay ? (
          <>
            {' · '}
            <span className="text-brand-accent">event day</span>
          </>
        ) : null}
      </div>
      <div className="mt-5 grid" style={{ gridTemplateColumns: '44px 1fr', rowGap: 7 }}>
        {rows.map((r, i) => (
          <Row key={i} row={r} />
        ))}
      </div>
    </div>
  );
}

function Row({ row }: { row: MiniAppRow }) {
  const cancelled = row.status === 'cancelled';
  return (
    <>
      <div className="pt-2 font-display text-[11px] text-paper-500">{row.time}</div>
      <div
        className="flex items-center justify-between gap-2.5 rounded-[5px] bg-paper-50 px-3 py-1.5"
        style={{
          borderLeft: `2px solid ${cancelled ? '#d9d3c2' : 'rgb(var(--brand-accent))'}`,
          opacity: cancelled ? 0.5 : 1,
        }}
      >
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium">{row.name}</div>
          <div className="text-[10.5px] text-paper-600">
            Party of {row.partySize}
            {cancelled ? ' · cancelled' : ''}
          </div>
        </div>
        {row.tag ? (
          <span className="shrink-0 rounded-full border border-brand-accent/25 bg-brand-accent/10 px-[7px] py-0.5 text-[10px] font-semibold text-brand-accent">
            {row.tag}
          </span>
        ) : null}
      </div>
    </>
  );
}

function NavGlyph({ label }: { label: string }) {
  // Tiny placeholder glyphs so the sidebar doesn't feel barren. Kept minimal
  // rather than importing a full icon set.
  const box = (
    <span className="inline-block h-[13px] w-[13px] shrink-0 rounded-[2px] bg-paper-300/60" />
  );
  void label;
  return box;
}
