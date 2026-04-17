import type { ColumnType, Generated } from 'kysely';

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type Jsonb = ColumnType<unknown, unknown, unknown>;

export interface DB {
  orgs: OrgsTable;
  locations: LocationsTable;
  location_hours: LocationHoursTable;
  location_hour_overrides: LocationHourOverridesTable;
  closed_days: ClosedDaysTable;
  users: UsersTable;
  sessions: SessionsTable;
  org_members: OrgMembersTable;
  roles: RolesTable;
  role_permissions: RolePermissionsTable;
  member_roles: MemberRolesTable;
  events: EventsTable;
  visits: VisitsTable;
  waitlist_entries: WaitlistEntriesTable;
  invitations: InvitationsTable;
  idempotency_keys: IdempotencyKeysTable;
  audit_log: AuditLogTable;
}

export interface OrgsTable {
  id: Generated<string>;
  name: string;
  address: string;
  zip: string;
  timezone: string;
  public_slug: string;
  slug_prefix: Generated<string>;
  slot_rounding: Generated<string>;
  kiosk_reset_seconds: Generated<number>;
  logo_url: string | null;
  theme: Generated<Jsonb>;
  form_fields: Generated<Jsonb>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  deleted_at: Timestamp | null;
}

export interface LocationsTable {
  id: Generated<string>;
  org_id: string;
  name: string;
  address: string | null;
  zip: string | null;
  qr_token: Generated<string>;
  is_primary: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  deleted_at: Timestamp | null;
}

export interface LocationHoursTable {
  id: Generated<string>;
  location_id: string;
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_active: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface LocationHourOverridesTable {
  id: Generated<string>;
  location_id: string;
  date: string;
  open_time: string | null;
  close_time: string | null;
  reason: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface ClosedDaysTable {
  id: Generated<string>;
  location_id: string;
  date: string;
  reason: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface UsersTable {
  id: Generated<string>;
  email: string;
  password_hash: string;
  totp_secret_enc: Buffer | null;
  totp_enabled: Generated<boolean>;
  display_name: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  deleted_at: Timestamp | null;
}

export interface SessionsTable {
  id: Generated<string>;
  user_id: string;
  token_hash: string;
  expires_at: Timestamp;
  revoked_at: Timestamp | null;
  last_used_at: Generated<Timestamp>;
  ip: string | null;
  user_agent: string | null;
  created_at: Generated<Timestamp>;
}

export interface OrgMembersTable {
  id: Generated<string>;
  org_id: string;
  user_id: string;
  is_superadmin: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  deleted_at: Timestamp | null;
}

export interface RolesTable {
  id: Generated<string>;
  org_id: string;
  name: string;
  description: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  deleted_at: Timestamp | null;
}

export interface RolePermissionsTable {
  id: Generated<string>;
  role_id: string;
  permission: string;
  scope_type: string | null;
  scope_id: string | null;
  created_at: Generated<Timestamp>;
}

export interface MemberRolesTable {
  id: Generated<string>;
  org_member_id: string;
  role_id: string;
  created_at: Generated<Timestamp>;
}

export interface EventsTable {
  id: Generated<string>;
  org_id: string;
  location_id: string;
  created_by: string;
  title: string;
  description: string | null;
  slug: string | null;
  public_id: string;
  starts_at: Timestamp;
  ends_at: Timestamp;
  capacity: number | null;
  waitlist_enabled: Generated<boolean>;
  waitlist_auto_promote: Generated<boolean>;
  form_fields: Jsonb | null;
  is_published: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  deleted_at: Timestamp | null;
}

export interface VisitsTable {
  id: Generated<string>;
  org_id: string;
  location_id: string;
  event_id: string | null;
  booked_by: string | null;
  booking_method: 'self' | 'admin' | 'kiosk';
  scheduled_at: Timestamp;
  form_response: Jsonb;
  status: Generated<'confirmed' | 'cancelled' | 'no_show'>;
  cancelled_at: Timestamp | null;
  cancelled_by: string | null;
  pii_redacted: Generated<boolean>;
  idempotency_key: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface WaitlistEntriesTable {
  id: Generated<string>;
  org_id: string;
  event_id: string;
  form_response: Jsonb;
  sort_order: number;
  status: Generated<'waiting' | 'promoted' | 'removed'>;
  promoted_at: Timestamp | null;
  promoted_by: string | null;
  promoted_visit_id: string | null;
  idempotency_key: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface InvitationsTable {
  id: Generated<string>;
  org_id: string;
  email: string;
  token_hash: string;
  invited_by: string;
  role_ids: Generated<string[]>;
  expires_at: Timestamp;
  accepted_at: Timestamp | null;
  accepted_by: string | null;
  created_at: Generated<Timestamp>;
}

export interface IdempotencyKeysTable {
  id: Generated<string>;
  key: string;
  scope: string;
  org_id: string | null;
  request_hash: string;
  response_status: number;
  response_body: Jsonb;
  expires_at: Timestamp;
  created_at: Generated<Timestamp>;
}

export interface AuditLogTable {
  id: Generated<string>;
  org_id: string | null;
  actor_id: string | null;
  actor_type: 'user' | 'guest' | 'kiosk' | 'system';
  action: string;
  target_type: string;
  target_id: string;
  diff: Jsonb | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Generated<Timestamp>;
}
