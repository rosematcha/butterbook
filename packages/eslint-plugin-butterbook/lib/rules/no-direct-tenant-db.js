'use strict';

// Blocks queries like getDb().selectFrom('visits') / insertInto / updateTable /
// deleteFrom on tenant-scoped tables when not inside a withOrgContext /
// withOrgRead callback.
//
// The check is a lightweight static approximation:
//   1. Identify tenant-scoped table names from a fixed list (mirrors SPEC §4.4).
//   2. Flag any CallExpression where:
//        - callee chain starts with `getDb()` or `db` (no tx arg), AND
//        - the next method is selectFrom / insertInto / updateTable / deleteFrom, AND
//        - the argument is a string literal in the tenant-scoped list.
//   3. Exempt a short allowlist of files where direct access is intentional
//      and documented (services/orgs.ts, scripts/, middleware/idempotency.ts,
//      auth/session.ts where session lookup is required without an orgId).
//
// False-negatives are possible (variable aliasing, dynamic table names). The
// rule is a safety net, not a replacement for code review.

const TENANT_TABLES = new Set([
  'locations',
  'location_hours',
  'location_hour_overrides',
  'closed_days',
  'org_members',
  'roles',
  'role_permissions',
  'member_roles',
  'event_series',
  'events',
  'visits',
  'waitlist_entries',
  'invitations',
  'idempotency_keys',
  'audit_log',
  'event_outbox',
  'notification_templates',
  'notifications_outbox',
  'notification_suppressions',
  'org_booking_policies',
  'org_booking_page',
  'visitors',
  'visitor_segments',
  'org_membership_policies',
  'membership_tiers',
  'memberships',
  'membership_payments',
  'guest_passes',
  'org_stripe_accounts',
  'stripe_events',
]);

const MUTATING_METHODS = new Set(['selectFrom', 'insertInto', 'updateTable', 'deleteFrom']);

const ALLOWED_FILES = [
  'src/services/orgs.ts',
  'src/scripts/bootstrap.ts',
  'src/scripts/cleanup-idempotency.ts',
  'src/auth/session.ts',
  'src/middleware/idempotency.ts',
  'src/routes/invitations.ts',
  'src/routes/kiosk.ts',
  'src/routes/intake.ts',
  'src/routes/org-export.ts',
  // Manage routes resolve a signed manage_token → visit row directly
  // (same bootstrap pattern as kiosk's qr_token lookup); downstream work
  // switches into withOrgContext / withOrgRead.
  'src/routes/manage.ts',
];

// Worker code polls the outbox directly; its queries scope themselves via
// status/locked_by, not via app.current_org_id, and subscribers switch into
// withOrgContext(row.org_id, ...) before doing tenant writes.
const ALLOWED_DIRS = [
  'src/worker/',
  'src/services/notifications/',
];

function fileAllowed(filename) {
  if (ALLOWED_FILES.some((p) => filename.endsWith(p))) return true;
  return ALLOWED_DIRS.some((d) => filename.includes(d));
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow direct getDb() calls on tenant-scoped tables outside withOrgContext/withOrgRead.',
    },
    messages: {
      disallowed:
        "Direct getDb() access to tenant-scoped table '{{table}}' is not allowed. Use withOrgContext or withOrgRead.",
    },
    schema: [],
  },

  create(context) {
    const filename = context.getFilename ? context.getFilename() : context.filename;
    if (fileAllowed(filename)) return {};

    return {
      CallExpression(node) {
        // Shape: <something>.<method>(<tableName>)
        if (
          node.callee.type !== 'MemberExpression' ||
          node.callee.property.type !== 'Identifier' ||
          !MUTATING_METHODS.has(node.callee.property.name)
        ) {
          return;
        }
        const arg = node.arguments[0];
        if (!arg || arg.type !== 'Literal' || typeof arg.value !== 'string') return;
        if (!TENANT_TABLES.has(arg.value)) return;

        // Is the receiver `getDb()` or a variable named `db`?
        const receiver = node.callee.object;
        let isBareDb = false;
        if (
          receiver.type === 'CallExpression' &&
          receiver.callee.type === 'Identifier' &&
          receiver.callee.name === 'getDb'
        ) {
          isBareDb = true;
        } else if (receiver.type === 'Identifier' && receiver.name === 'db') {
          isBareDb = true;
        }

        if (isBareDb) {
          context.report({ node, messageId: 'disallowed', data: { table: arg.value } });
        }
      },
    };
  },
};
