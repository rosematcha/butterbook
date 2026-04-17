export function sortByDisplayOrder<T extends { displayOrder: number }>(xs: T[]): T[] {
  return [...xs].sort((a, b) => a.displayOrder - b.displayOrder);
}

export function redactString(s: string, visible = 4): string {
  if (s.length <= visible) return '*'.repeat(s.length);
  return '*'.repeat(s.length - visible) + s.slice(-visible);
}

export function timeToMinutes(hhmm: string): number {
  const parts = hhmm.split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  return h * 60 + m;
}

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
