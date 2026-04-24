import { sql, type Tx } from '../db/index.js';
import type { RawBuilder } from 'kysely';

type Filter = unknown;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function segmentPredicate(filter: Filter): RawBuilder<boolean> {
  if (!isRecord(filter)) return sql<boolean>`true`;

  if (Array.isArray(filter.and)) {
    const parts: Array<RawBuilder<boolean>> = filter.and.map(segmentPredicate);
    return sql<boolean>`(${sql.join(parts, sql` AND `)})`;
  }
  if (Array.isArray(filter.or)) {
    const parts: Array<RawBuilder<boolean>> = filter.or.map(segmentPredicate);
    return sql<boolean>`(${sql.join(parts, sql` OR `)})`;
  }
  if (typeof filter.tag === 'string') {
    return sql<boolean>`${filter.tag} = ANY(visitors.tags)`;
  }
  if (typeof filter.emailDomain === 'string') {
    const domain = `%@${filter.emailDomain.toLowerCase()}`;
    return sql<boolean>`lower(visitors.email::text) LIKE ${domain}`;
  }
  if (typeof filter.visitedAfter === 'string') {
    return sql<boolean>`EXISTS (
      SELECT 1 FROM visits v
      WHERE v.visitor_id = visitors.id
        AND v.org_id = visitors.org_id
        AND v.scheduled_at >= ${new Date(filter.visitedAfter)}
    )`;
  }
  if (typeof filter.visitedBefore === 'string') {
    return sql<boolean>`EXISTS (
      SELECT 1 FROM visits v
      WHERE v.visitor_id = visitors.id
        AND v.org_id = visitors.org_id
        AND v.scheduled_at <= ${new Date(filter.visitedBefore)}
    )`;
  }
  if (typeof filter.hasMembership === 'boolean') {
    return filter.hasMembership
      ? sql<boolean>`false`
      : sql<boolean>`true`;
  }
  return sql<boolean>`true`;
}

export async function countSegmentVisitors(tx: Tx, orgId: string, filter: Filter): Promise<number> {
  const row = await tx
    .selectFrom('visitors')
    .select((eb) => eb.fn.countAll<number>().as('c'))
    .where('org_id', '=', orgId)
    .where('deleted_at', 'is', null)
    .where(segmentPredicate(filter))
    .executeTakeFirst();
  return Number(row?.c ?? 0);
}
