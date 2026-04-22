import { logger } from '../utils/logger.js';

export interface OutboxRow {
  id: string;
  org_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
}

export type Handler = (row: OutboxRow) => Promise<void>;

const handlers = new Map<string, Handler[]>();

export function registerHandler(eventType: string, handler: Handler): void {
  const list = handlers.get(eventType) ?? [];
  list.push(handler);
  handlers.set(eventType, list);
}

export function clearHandlersForTests(): void {
  handlers.clear();
}

export interface DispatchResult {
  ok: boolean;
  error?: Error;
}

export async function dispatch(row: OutboxRow): Promise<DispatchResult> {
  const list = handlers.get(row.event_type);
  if (!list || list.length === 0) {
    logger.debug({ eventType: row.event_type, id: row.id }, 'worker.no_handler');
    return { ok: true };
  }
  for (const h of list) {
    try {
      await h(row);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      logger.error({ err: e, eventType: row.event_type, id: row.id }, 'worker.handler_failed');
      return { ok: false, error: e };
    }
  }
  return { ok: true };
}

// Exponential backoff: base 30s, doubled per attempt, capped at 1h.
export function nextAvailableAt(attempts: number, now: Date = new Date()): Date {
  const base = 30_000;
  const cap = 60 * 60_000;
  const delay = Math.min(cap, base * Math.pow(2, Math.max(0, attempts - 1)));
  return new Date(now.getTime() + delay);
}
