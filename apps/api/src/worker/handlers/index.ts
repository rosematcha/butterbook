import { registerHandler, type OutboxRow } from '../dispatcher.js';
import { SUBSCRIBERS } from '../../services/notifications/subscribers.js';

// Wire every notification subscriber as an event_outbox handler. Kept in a
// separate file so additional subscribers (webhooks, analytics, etc.) can be
// registered alongside without touching the dispatcher itself.
export function registerAllHandlers(): void {
  for (const [eventType, fn] of Object.entries(SUBSCRIBERS)) {
    registerHandler(eventType, async (row: OutboxRow) => {
      const payload = (typeof row.payload === 'string'
        ? JSON.parse(row.payload)
        : row.payload) as Record<string, unknown>;
      await fn({ orgId: row.org_id, eventType: row.event_type, payload });
    });
  }
}
