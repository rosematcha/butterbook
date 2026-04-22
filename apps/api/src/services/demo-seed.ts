// Seeds a fresh "Whitman" demo org, centered on real `now()`.
//
// Called by POST /api/v1/demo/session. Each call creates:
//  - one ephemeral superadmin user (admin@... with a random suffix so concurrent
//    demos don't collide on the UNIQUE email constraint)
//  - one org flagged is_demo=true
//  - 3 locations, weekly hours, a couple of hour overrides, a closed day
//  - 3 roles with a realistic permission spread, plus fake staff members
//  - ~10 events spanning 3 weeks back → 5 weeks forward
//  - ~320 visits distributed around "today" so the dashboard lands on a live-
//    looking day-view
//  - a handful of waitlist entries on the capped spring-opening event
//  - a live session cookie so the provision route can hand it straight back
//
// Dates are always offsets from new Date() at seed time. A visitor on April 20
// and one on September 15 both see "today" populated with fresh reservations.
//
// Deliberately self-contained: we bypass createOrgWithOwner() so we can set
// is_demo=true in the same INSERT and keep the whole thing inside two
// transactions (one global for users+org, one RLS-scoped for org-interior
// data). All other rows go through the normal withOrgContext path so RLS is
// exercised by the seed itself — a rot canary for the RLS surface.

import crypto from 'node:crypto';
import { sql } from 'kysely';
import { DEFAULT_FORM_FIELDS, type ActorContext, type Permission } from '@butterbook/shared';
import { getDb, withGlobalContext, withOrgContext } from '../db/index.js';
import { hashPassword } from '../utils/passwords.js';
import { createSession } from '../auth/session.js';
import type { Tx } from '../db/index.js';

// Shared dummy password for the seeded admin. The value is not sensitive: the
// demo landing page displays it, and the account only exists for the length of
// the TTL window in an is_demo=true org. We still argon2-hash it so the login
// path is identical to production.
export const DEMO_PASSWORD = 'password';

// Org timezone. The Whitman is hardcoded to NY — if we ever let the seed
// take other fictional museums, lift this to a parameter on seedDemoOrg.
const ORG_TZ = 'America/New_York';

// Returns how many hours the target tz is BEHIND UTC for the given moment.
// EDT is 4, EST is 5. Using Intl avoids hand-rolling a DST table and stays
// correct if we ever switch the demo org to a different zone.
function tzOffsetHours(d: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(d);
  const num = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const hour = num('hour') === 24 ? 0 : num('hour');
  const asUtc = Date.UTC(num('year'), num('month') - 1, num('day'), hour, num('minute'));
  return Math.round((d.getTime() - asUtc) / (60 * 60 * 1000));
}

// Returns the YYYY-MM-DD calendar date in the target tz. Use this instead of
// toISOString().slice(0,10), which returns the UTC date and skews by a day
// near midnight boundaries.
function tzDate(d: Date, tz: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const num = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { year: num('year'), month: num('month'), day: num('day') };
}

// Builds a UTC Date whose rendering in `tz` is "YYYY-MM-DD at HH:MM" where
// YYYY-MM-DD is the org-local date of `base` plus `dayOffset` days, and
// HH:MM is the desired org-local time. All demo visit/event times run
// through this helper so server-TZ drift can't surface as "open at 5 AM".
function atOrgLocal(base: Date, dayOffset: number, hour: number, minute = 0): Date {
  const today = tzDate(base, ORG_TZ);
  // Construct midnight on the target calendar day (any UTC instant on that
  // day will do — we only use it to probe the tz offset).
  const probe = new Date(Date.UTC(today.year, today.month - 1, today.day + dayOffset, 12, 0));
  const offset = tzOffsetHours(probe, ORG_TZ);
  return new Date(
    Date.UTC(
      probe.getUTCFullYear(),
      probe.getUTCMonth(),
      probe.getUTCDate(),
      hour + offset,
      minute,
      0,
    ),
  );
}

// Same as atOrgLocal but returns a YYYY-MM-DD string for columns that want
// a DATE instead of a TIMESTAMPTZ (location_hour_overrides, closed_days).
function orgDateString(base: Date, dayOffset: number): string {
  const today = tzDate(base, ORG_TZ);
  const d = new Date(Date.UTC(today.year, today.month - 1, today.day + dayOffset));
  return d.toISOString().slice(0, 10);
}

// Fake-staff emails are deterministic so the same 5 "employees" are reused
// across all demo orgs. This keeps the users table from ballooning: the prune
// script only deletes the ephemeral admin, not these shared fixtures.
const FAKE_STAFF: Array<{ email: string; displayName: string; roleKey: 'admin' | 'docent' | 'volunteer' }> = [
  { email: 'mharper@whitman.demo', displayName: 'M. Harper', roleKey: 'admin' },
  { email: 'jchen@whitman.demo', displayName: 'J. Chen', roleKey: 'docent' },
  { email: 'apatel@whitman.demo', displayName: 'A. Patel', roleKey: 'docent' },
  { email: 'smorales@whitman.demo', displayName: 'S. Morales', roleKey: 'volunteer' },
  { email: 'rkim@whitman.demo', displayName: 'R. Kim', roleKey: 'volunteer' },
];

const VISITOR_NAMES = [
  'Elena Rivera', 'Okafor family', 'Jordan Bell', 'Anya Petrova', 'Hayes Elementary',
  'Lin-Park', 'Sam Whitfield', 'Dalia Nassar', 'Priya Shah', 'Marcus Chen',
  'Tomás Alvarez', 'Keisha Brown', 'Yuki Tanaka', 'Aidan O\'Sullivan', 'Ravi Iyer',
  'Nadia Haddad', 'Ben Okonkwo', 'Clara Voss', 'Emi Nakamura', 'Luca Romano',
  'Zara Malik', 'Theo Dubois', 'Sierra Lin', 'Omar Farouk', 'Fiona Walsh',
  'Rafael Ortiz', 'Anika Desai', 'Jonas Weber', 'Ingrid Holm', 'Selim Kaya',
  'Harper Douglas', 'Noor Abbas', 'Daniel Park', 'Eve Abramson', 'Leo Marin',
];

const TAGS_POOL = ['member', 'docent', 'walk-in', 'school', 'donor', 'press'];

// Permissions by role key. Intentionally omits 'admin.manage_roles' and
// 'admin.manage_users' from the admin role — superadmins still have those, but
// a visitor playing with an admin member shouldn't be able to reshape the
// permission model during a demo session.
const ROLE_PERMISSIONS: Record<'admin' | 'docent' | 'volunteer', Permission[]> = {
  admin: [
    'visits.create', 'visits.edit', 'visits.cancel', 'visits.view_all',
    'events.create', 'events.edit', 'events.delete', 'events.publish', 'events.manage_waitlist', 'events.view_registrations',
    'admin.manage_locations', 'admin.manage_hours', 'admin.manage_closed_days', 'admin.manage_forms',
    'reports.view', 'reports.export',
    'kiosk.access',
  ],
  docent: [
    'visits.view_all', 'visits.edit',
    'events.view_registrations', 'events.manage_waitlist',
    'reports.view',
    'kiosk.access',
  ],
  volunteer: [
    'visits.create',
    'kiosk.access',
  ],
};

export interface SeededDemo {
  orgId: string;
  userId: string;
  sessionToken: string;
  expiresAt: Date;
}

export async function seedDemoOrg(): Promise<SeededDemo> {
  const now = new Date();
  const suffix = crypto.randomBytes(6).toString('hex');
  const ephemeralEmail = `demo-${suffix}@whitman.demo`;
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const { orgId, userId } = await withGlobalContext(async (tx) => {
    // Ephemeral admin user — deleted alongside the org by the prune cron.
    const user = await tx
      .insertInto('users')
      .values({ email: ephemeralEmail, password_hash: passwordHash, display_name: 'Demo Admin' })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    // Reuse the shared fake-staff users across all demo orgs. ON CONFLICT is
    // the cheap way to make this idempotent without a separate bootstrap step.
    for (const staff of FAKE_STAFF) {
      await tx
        .insertInto('users')
        .values({ email: staff.email, password_hash: passwordHash, display_name: staff.displayName })
        .onConflict((oc) => oc.column('email').doNothing())
        .execute();
    }

    const org = await tx
      .insertInto('orgs')
      .values({
        name: 'The Whitman',
        address: '420 Archive Lane',
        zip: '12345',
        country: 'US',
        city: 'Millbrook',
        state: 'NY',
        timezone: 'America/New_York',
        public_slug: `whitman-demo-${suffix}`,
        terminology: 'visit',
        time_model: 'start_end',
        form_fields: JSON.stringify(DEFAULT_FORM_FIELDS),
        theme: JSON.stringify({}),
        is_demo: true,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    await tx
      .insertInto('org_members')
      .values({ org_id: org.id, user_id: user.id, is_superadmin: true })
      .execute();

    return { orgId: org.id, userId: user.id };
  });

  // Everything else runs RLS-scoped, exactly as a real admin would create it.
  // The `actor` identifies the ephemeral admin so audit rows are attributable.
  const actor: ActorContext = {
    userId,
    orgId,
    isSuperadmin: true,
    permissions: new Set<Permission>(),
    actorType: 'system',
    ip: null,
    userAgent: 'demo-seed',
  };

  await withOrgContext(orgId, actor, async ({ tx, audit }) => {
    const primaryLocationId = await seedLocations(tx, orgId);
    await seedHours(tx, primaryLocationId);
    await seedOverridesAndClosed(tx, primaryLocationId, now);
    const roles = await seedRoles(tx, orgId);
    const memberIds = await seedMembers(tx, orgId, roles);
    const eventIds = await seedEvents(tx, orgId, primaryLocationId, userId, now);
    await seedVisits(tx, orgId, primaryLocationId, userId, eventIds, now);
    await seedWaitlist(tx, orgId, eventIds.openingCapped);
    await audit({
      action: 'demo.seeded',
      targetType: 'org',
      targetId: orgId,
      diff: { after: { members: memberIds.length, events: Object.keys(eventIds).length } },
    });
  });

  const { token, expiresAt } = await createSession({ userId, ip: null, userAgent: 'demo-seed' });
  return { orgId, userId, sessionToken: token, expiresAt };
}

async function seedLocations(tx: Tx, orgId: string): Promise<string> {
  const rows = await tx
    .insertInto('locations')
    .values([
      { org_id: orgId, name: 'Main Gallery', is_primary: true, address: '420 Archive Lane', zip: '12345', city: 'Millbrook', state: 'NY', country: 'US' },
      { org_id: orgId, name: 'Annex Studio', is_primary: false, address: '12 Cooper Street', zip: '12345', city: 'Millbrook', state: 'NY', country: 'US' },
      { org_id: orgId, name: 'Sculpture Garden', is_primary: false, address: '420 Archive Lane', zip: '12345', city: 'Millbrook', state: 'NY', country: 'US' },
    ])
    .returning(['id', 'is_primary'])
    .execute();
  const primary = rows.find((r) => r.is_primary);
  if (!primary) throw new Error('seed: missing primary location');
  return primary.id;
}

async function seedHours(tx: Tx, locationId: string): Promise<void> {
  // Tue–Sun 10:00–17:00, closed Mondays. All three locations share these hours
  // for the demo; we only seed the primary to keep the seed fast — availability
  // for the secondary locations falls back to the day being "closed," which
  // visitors can explore via the hours editor.
  const days = [2, 3, 4, 5, 6, 0]; // Tue..Sun; 1 = Monday is the closed day
  for (const day of days) {
    await tx
      .insertInto('location_hours')
      .values({ location_id: locationId, day_of_week: day, open_time: '10:00:00', close_time: '17:00:00' })
      .execute();
  }
}

async function seedOverridesAndClosed(tx: Tx, locationId: string, now: Date): Promise<void> {
  // Two overrides and one closed day, placed relative to now so they're always
  // within the next ~6 weeks. Dates are computed in the org timezone so
  // midnight UTC boundaries don't nudge them off by a day.
  const plus = (days: number): string => orgDateString(now, days);
  await tx
    .insertInto('location_hour_overrides')
    .values([
      { location_id: locationId, date: plus(9), open_time: '12:00:00', close_time: '20:00:00', reason: 'Late opening: Spring Opening Reception' },
      { location_id: locationId, date: plus(26), open_time: '10:00:00', close_time: '14:00:00', reason: 'Half day — staff retreat' },
    ])
    .execute();
  await tx
    .insertInto('closed_days')
    .values({ location_id: locationId, date: plus(34), reason: 'Facility maintenance' })
    .execute();
}

async function seedRoles(
  tx: Tx,
  orgId: string,
): Promise<Record<'admin' | 'docent' | 'volunteer', string>> {
  const inserted = await tx
    .insertInto('roles')
    .values([
      { org_id: orgId, name: 'Admin', description: 'Full admin access, minus role and user management.' },
      { org_id: orgId, name: 'Docent', description: 'Read-only on visits, can view event registrations and promote the waitlist.' },
      { org_id: orgId, name: 'Volunteer', description: 'Kiosk + lightweight visit creation.' },
    ])
    .returning(['id', 'name'])
    .execute();
  const byName = Object.fromEntries(inserted.map((r) => [r.name, r.id])) as Record<string, string>;
  const ids = {
    admin: byName['Admin']!,
    docent: byName['Docent']!,
    volunteer: byName['Volunteer']!,
  };
  for (const key of ['admin', 'docent', 'volunteer'] as const) {
    const perms = ROLE_PERMISSIONS[key];
    await tx
      .insertInto('role_permissions')
      .values(perms.map((p) => ({ role_id: ids[key], permission: p })))
      .execute();
  }
  return ids;
}

async function seedMembers(
  tx: Tx,
  orgId: string,
  roles: Record<'admin' | 'docent' | 'volunteer', string>,
): Promise<string[]> {
  // Resolve the shared staff users by email. They were inserted in the global
  // tx above so they exist regardless of which demo org created them first.
  const staffEmails = FAKE_STAFF.map((s) => s.email);
  const staffUsers = await getDb()
    .selectFrom('users')
    .select(['id', 'email'])
    .where('email', 'in', staffEmails)
    .execute();
  const byEmail = new Map(staffUsers.map((u) => [u.email, u.id]));

  const memberRows = FAKE_STAFF.map((s) => ({
    org_id: orgId,
    user_id: byEmail.get(s.email)!,
    is_superadmin: false,
  }));
  const members = await tx
    .insertInto('org_members')
    .values(memberRows)
    .returning(['id'])
    .execute();

  // Pair each member with their role.
  const pairs: Array<{ org_member_id: string; role_id: string }> = [];
  for (let i = 0; i < FAKE_STAFF.length; i++) {
    pairs.push({ org_member_id: members[i]!.id, role_id: roles[FAKE_STAFF[i]!.roleKey] });
  }
  await tx.insertInto('member_roles').values(pairs).execute();
  return members.map((m) => m.id);
}

interface SeededEventIds {
  pastTalk: string;
  pastWorkshop: string;
  openingCapped: string;
  kidsAfternoon: string;
  membersPreview: string;
  summerIntensive: string;
  artistTour: string;
  quietHours: string;
}

async function seedEvents(
  tx: Tx,
  orgId: string,
  locationId: string,
  createdBy: string,
  now: Date,
): Promise<SeededEventIds> {
  // atOrgLocal anchors the start time in NY local so events like the
  // 6pm Spring Opening don't drift to 2pm on a UTC server.
  const plusDays = (days: number, hour = 10, minute = 0): Date =>
    atOrgLocal(now, days, hour, minute);
  const specs: Array<{
    key: keyof SeededEventIds;
    title: string;
    description: string;
    startDays: number;
    durationHours: number;
    startHour?: number;
    capacity: number | null;
    waitlist: boolean;
    published: boolean;
  }> = [
    { key: 'pastTalk', title: 'First Friday Talk: The Archive as Material', description: 'A lecture on physical archives and their stewardship.', startDays: -7, startHour: 18, durationHours: 1.5, capacity: 40, waitlist: false, published: true },
    { key: 'pastWorkshop', title: 'Printmaking Workshop: Relief Basics', description: 'Hands-on introduction to woodblock and linocut.', startDays: -21, startHour: 13, durationHours: 3, capacity: 14, waitlist: true, published: true },
    { key: 'openingCapped', title: 'Spring Opening Reception', description: 'The Whitman\'s spring exhibition opens. Light refreshments, short remarks at 7pm.', startDays: 9, startHour: 18, durationHours: 3, capacity: 60, waitlist: true, published: true },
    { key: 'kidsAfternoon', title: 'Kids\' Art Afternoon', description: 'Drop-in art projects for ages 6–12.', startDays: 2, startHour: 14, durationHours: 2, capacity: 30, waitlist: false, published: true },
    { key: 'membersPreview', title: 'Members Preview — Contemporary Wing', description: 'Members-only early access to the contemporary wing reinstall.', startDays: 12, startHour: 17, durationHours: 2, capacity: 100, waitlist: false, published: true },
    { key: 'summerIntensive', title: 'Summer Intensive: Materials & Methods', description: 'Five-day studio intensive for advanced students.', startDays: 35, startHour: 10, durationHours: 6, capacity: 12, waitlist: true, published: false },
    { key: 'artistTour', title: 'Artist-led Gallery Tour', description: 'Joan M. walks visitors through the new acquisitions.', startDays: 5, startHour: 11, durationHours: 1, capacity: 20, waitlist: false, published: true },
    { key: 'quietHours', title: 'Quiet Morning Hours', description: 'A low-stimulus visiting window for sensory-sensitive guests.', startDays: 16, startHour: 9, durationHours: 2, capacity: null, waitlist: false, published: true },
  ];

  const ids: Partial<SeededEventIds> = {};
  for (const s of specs) {
    const starts = plusDays(s.startDays, s.startHour ?? 10);
    const ends = new Date(starts.getTime() + s.durationHours * 60 * 60 * 1000);
    const publicId = `e-${crypto.randomBytes(6).toString('hex')}`;
    const slug = s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    const row = await tx
      .insertInto('events')
      .values({
        org_id: orgId,
        location_id: locationId,
        created_by: createdBy,
        title: s.title,
        description: s.description,
        slug,
        public_id: publicId,
        starts_at: starts,
        ends_at: ends,
        capacity: s.capacity,
        waitlist_enabled: s.waitlist,
        waitlist_auto_promote: s.waitlist,
        is_published: s.published,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    ids[s.key] = row.id;
  }
  return ids as SeededEventIds;
}

async function seedVisits(
  tx: Tx,
  orgId: string,
  locationId: string,
  bookedBy: string,
  events: SeededEventIds,
  now: Date,
): Promise<void> {
  // Distribute ~320 visits. Heavier today and the next 4 days so the dashboard
  // feels lived-in; lighter on past days so reports have shape; a handful of
  // cancelled/no_show rows so status filters exercise non-confirmed states.
  const rows: Array<{
    org_id: string;
    location_id: string;
    event_id: string | null;
    booked_by: string | null;
    booking_method: 'self' | 'admin' | 'kiosk';
    scheduled_at: Date;
    form_response: string;
    status: 'confirmed' | 'cancelled' | 'no_show';
    cancelled_at: Date | null;
    tags: string[];
  }> = [];

  // Counts tuned so a small-museum "lived-in Tuesday" lands on the Today
  // view: busy enough to exercise the timeline, quiet enough that visitors
  // don't mistake the seed volume for a product claim.
  const dayDistribution: Array<[number, number]> = [
    [-30, 2], [-21, 3], [-14, 4], [-10, 4], [-7, 5],
    [-5, 5], [-4, 6], [-3, 7], [-2, 8], [-1, 10],
    [0, 14],                      // today — peak
    [1, 12], [2, 10], [3, 9], [4, 8],
    [5, 6], [6, 5], [7, 4], [10, 3], [14, 2],
  ];

  let seq = 0;
  for (const [dayOffset, count] of dayDistribution) {
    for (let i = 0; i < count; i++) {
      const name = VISITOR_NAMES[seq % VISITOR_NAMES.length]!;
      const partySize = 1 + ((seq * 7) % 5);
      const hour = 10 + ((seq * 3) % 7); // 10am–4pm, keeps visits inside the 10–5 open window
      const minute = (seq % 4) * 15;
      const when = atOrgLocal(now, dayOffset, hour, minute);

      // 6% cancelled, 3% no_show, otherwise confirmed. Past no_show only so the
      // timeline stays coherent.
      let status: 'confirmed' | 'cancelled' | 'no_show' = 'confirmed';
      if (seq % 17 === 0) status = 'cancelled';
      else if (dayOffset < 0 && seq % 31 === 0) status = 'no_show';

      const tags: string[] = [];
      if (seq % 5 === 0) tags.push(TAGS_POOL[seq % TAGS_POOL.length]!);

      const method: 'self' | 'admin' | 'kiosk' =
        seq % 4 === 0 ? 'kiosk' : seq % 3 === 0 ? 'self' : 'admin';

      rows.push({
        org_id: orgId,
        location_id: locationId,
        event_id: null,
        booked_by: method === 'admin' ? bookedBy : null,
        booking_method: method,
        scheduled_at: when,
        form_response: JSON.stringify({
          name,
          zip: String(10000 + ((seq * 137) % 89999)),
          party_size: partySize,
        }),
        status,
        cancelled_at: status === 'cancelled' ? new Date(when.getTime() - 60 * 60 * 1000) : null,
        tags,
      });
      seq += 1;
    }
  }

  // Tie a cluster of visits to the Spring Opening so the event page has real
  // registrations to click through. Smaller than a real opening reception so
  // the capacity bar doesn't read like a stadium show.
  for (let i = 0; i < 9; i++) {
    const name = VISITOR_NAMES[(seq + i) % VISITOR_NAMES.length]!;
    const when = atOrgLocal(now, 9, 18, (i % 4) * 10);
    rows.push({
      org_id: orgId,
      location_id: locationId,
      event_id: events.openingCapped,
      booked_by: null,
      booking_method: 'self',
      scheduled_at: when,
      form_response: JSON.stringify({ name, zip: '12345', party_size: 2 }),
      status: 'confirmed',
      cancelled_at: null,
      tags: [],
    });
  }

  // Chunked insert so we don't trip any implicit statement-size limits.
  const chunkSize = 100;
  for (let i = 0; i < rows.length; i += chunkSize) {
    await tx.insertInto('visits').values(rows.slice(i, i + chunkSize)).execute();
  }
}

async function seedWaitlist(tx: Tx, orgId: string, eventId: string): Promise<void> {
  const rows = Array.from({ length: 6 }, (_, i) => ({
    org_id: orgId,
    event_id: eventId,
    form_response: JSON.stringify({
      name: VISITOR_NAMES[(i * 5) % VISITOR_NAMES.length],
      zip: '12345',
      party_size: 2,
    }),
    sort_order: (i + 1) * 1024,
  }));
  await tx.insertInto('waitlist_entries').values(rows).execute();
}

// Count of currently-seeded demo orgs. Used to enforce DEMO_MAX_ORGS at the
// provisioning route and to expose `demo_orgs_active` on /metrics.
export async function countDemoOrgs(): Promise<number> {
  const row = await getDb()
    .selectFrom('orgs')
    .select((eb) => eb.fn.countAll<number>().as('c'))
    .where('is_demo', '=', true)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return Number(row?.c ?? 0);
}

// Silence unused-var warning if sql is stripped at build.
void sql;
