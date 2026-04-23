interface ZonedDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
}

export interface WeeklySeriesPlanInput {
  startsAt: Date;
  endsAt: Date;
  orgTimezone: string;
  weekday: number;
  untilDate?: string | null;
  occurrenceCount?: number | null;
  slugBase?: string | null;
}

export interface PlannedSeriesOccurrence {
  ordinal: number;
  startsAt: Date;
  endsAt: Date;
  localDate: string;
  slug: string | null;
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function planWeeklySeriesOccurrences(input: WeeklySeriesPlanInput): PlannedSeriesOccurrence[] {
  const durationMs = input.endsAt.getTime() - input.startsAt.getTime();
  if (durationMs <= 0) {
    throw new Error('endsAt must be after startsAt');
  }

  const anchor = zonedParts(input.startsAt, input.orgTimezone);
  if (anchor.weekday !== input.weekday) {
    throw new Error('recurrence weekday must match the first occurrence');
  }

  const occurrences: PlannedSeriesOccurrence[] = [];
  const maxOccurrences = input.occurrenceCount ?? Number.POSITIVE_INFINITY;
  let ordinal = 1;

  while (ordinal <= maxOccurrences) {
    const dateParts = addDays({ year: anchor.year, month: anchor.month, day: anchor.day }, (ordinal - 1) * 7);
    const localDate = formatDate(dateParts.year, dateParts.month, dateParts.day);
    if (input.untilDate && localDate > input.untilDate) break;

    const startsAt = zonedDateTimeToUtc(
      dateParts.year,
      dateParts.month,
      dateParts.day,
      anchor.hour,
      anchor.minute,
      anchor.second,
      input.orgTimezone,
    );
    occurrences.push({
      ordinal,
      startsAt,
      endsAt: new Date(startsAt.getTime() + durationMs),
      localDate,
      slug: input.slugBase ? `${input.slugBase}-${localDate.replaceAll('-', '')}` : null,
    });
    ordinal += 1;
  }

  if (occurrences.length === 0) {
    throw new Error('recurrence settings produced no occurrences');
  }
  return occurrences;
}

function zonedParts(date: Date, timeZone: string): ZonedDateTimeParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(date);

  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';
  const hour = Number(get('hour'));
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: hour === 24 ? 0 : hour,
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: WEEKDAY_MAP[get('weekday')] ?? 0,
  };
}

function tzOffsetMinutes(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((date.getTime() - asUtc) / 60_000);
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const initialOffset = tzOffsetMinutes(new Date(localAsUtc), timeZone);
  const candidate = new Date(localAsUtc + initialOffset * 60_000);
  const refinedOffset = tzOffsetMinutes(candidate, timeZone);
  return new Date(localAsUtc + refinedOffset * 60_000);
}

function addDays(
  date: { year: number; month: number; day: number },
  days: number,
): { year: number; month: number; day: number } {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days, 12, 0, 0));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
