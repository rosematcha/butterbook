import type { PlanSlug } from '@butterbook/shared';
import { getPlan } from '@butterbook/shared';
import { sql } from 'kysely';
import type { Tx } from '../db/index.js';
import { getOrgPlan } from './plan.js';

export interface UsageBucket {
  used: number;
  cap: number;
  pctUsed: number;
  overCap: boolean;
}

export interface UsageSnapshot {
  periodYyyymm: number;
  appointments: UsageBucket;
  events: UsageBucket;
}

/**
 * Computes the YYYYMM period integer for the current moment in the org's timezone.
 */
export function currentPeriodYyyymm(timezone: string): number {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  return Number(year) * 100 + Number(month);
}

/**
 * Returns the current usage snapshot for the org, creating the period row if needed.
 */
export async function getUsageSnapshot(tx: Tx, orgId: string): Promise<UsageSnapshot> {
  const orgRow = await tx
    .selectFrom('orgs')
    .select(['timezone', 'plan', 'is_demo', 'plan_grandfathered_until'])
    .where('id', '=', orgId)
    .executeTakeFirstOrThrow();

  const period = currentPeriodYyyymm(orgRow.timezone);
  const { effectivePlan } = await getOrgPlan(tx, orgId);
  const planDef = getPlan(effectivePlan);

  const usageRow = await tx
    .selectFrom('org_usage_periods')
    .select(['appointments_count', 'events_count'])
    .where('org_id', '=', orgId)
    .where('period_yyyymm', '=', period)
    .executeTakeFirst();

  const apptUsed = usageRow?.appointments_count ?? 0;
  const evtUsed = usageRow?.events_count ?? 0;

  return {
    periodYyyymm: period,
    appointments: makeBucket(apptUsed, planDef.appointmentsPerMonth),
    events: makeBucket(evtUsed, planDef.eventsPerMonth),
  };
}

function makeBucket(used: number, cap: number): UsageBucket {
  return {
    used,
    cap,
    pctUsed: cap > 0 ? used / cap : 0,
    overCap: used > cap,
  };
}

/**
 * Increments the appointment counter for the current period. UPSERT — creates
 * the period row if it doesn't exist. Soft enforcement: never throws on cap exceeded.
 */
export async function recordAppointmentUsage(tx: Tx, orgId: string): Promise<void> {
  const tz = await getOrgTimezone(tx, orgId);
  const period = currentPeriodYyyymm(tz);

  await tx
    .insertInto('org_usage_periods')
    .values({
      org_id: orgId,
      period_yyyymm: period,
      appointments_count: 1,
      events_count: 0,
    })
    .onConflict((oc) =>
      oc.columns(['org_id', 'period_yyyymm']).doUpdateSet({
        appointments_count: sql`org_usage_periods.appointments_count + 1`,
        updated_at: new Date(),
      }),
    )
    .execute();
}

/**
 * Increments the event counter for the current period.
 */
export async function recordEventUsage(tx: Tx, orgId: string): Promise<void> {
  const tz = await getOrgTimezone(tx, orgId);
  const period = currentPeriodYyyymm(tz);

  await tx
    .insertInto('org_usage_periods')
    .values({
      org_id: orgId,
      period_yyyymm: period,
      appointments_count: 0,
      events_count: 1,
    })
    .onConflict((oc) =>
      oc.columns(['org_id', 'period_yyyymm']).doUpdateSet({
        events_count: sql`org_usage_periods.events_count + 1`,
        updated_at: new Date(),
      }),
    )
    .execute();
}

async function getOrgTimezone(tx: Tx, orgId: string): Promise<string> {
  const row = await tx
    .selectFrom('orgs')
    .select('timezone')
    .where('id', '=', orgId)
    .executeTakeFirstOrThrow();
  return row.timezone;
}
