import type { ColumnType, Generated } from 'kysely';

type Timestamp = Date;
type Jsonb = unknown;
export type { Jsonb };

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
  event_series: EventSeriesTable;
  events: EventsTable;
  visits: VisitsTable;
  waitlist_entries: WaitlistEntriesTable;
  invitations: InvitationsTable;
  idempotency_keys: IdempotencyKeysTable;
  audit_log: AuditLogTable;
  event_outbox: EventOutboxTable;
  notification_templates: NotificationTemplatesTable;
  notifications_outbox: NotificationsOutboxTable;
  notification_suppressions: NotificationSuppressionsTable;
  org_booking_policies: OrgBookingPoliciesTable;
  org_booking_page: OrgBookingPageTable;
  visitors: VisitorsTable;
  visitor_segments: VisitorSegmentsTable;
  org_membership_policies: OrgMembershipPoliciesTable;
  membership_tiers: MembershipTiersTable;
  memberships: MembershipsTable;
  membership_payments: MembershipPaymentsTable;
  guest_passes: GuestPassesTable;
  org_stripe_accounts: OrgStripeAccountsTable;
  stripe_events: StripeEventsTable;
}

export interface OrgStripeAccountsTable {
  org_id: string;
  stripe_account_id: string;
  charges_enabled: Generated<boolean>;
  payouts_enabled: Generated<boolean>;
  default_currency: Generated<string>;
  webhook_secret: Buffer | null;
  connected_at: Generated<Timestamp>;
  disconnected_at: Timestamp | null;
  updated_at: Generated<Timestamp>;
}

export interface StripeEventsTable {
  id: Generated<string>;
  org_id: string;
  stripe_event_id: string;
  event_type: string;
  payload: ColumnType<Jsonb, string, string>;
  processed_at: Timestamp | null;
  created_at: Generated<Timestamp>;
}

export interface OrgMembershipPoliciesTable {
  org_id: string;
  enabled: Generated<boolean>;
  grace_period_days: Generated<number>;
  renewal_reminder_days: Generated<number[]>;
  self_cancel_enabled: Generated<boolean>;
  self_update_enabled: Generated<boolean>;
  public_page_enabled: Generated<boolean>;
  updated_at: Generated<Timestamp>;
}

export interface MembershipTiersTable {
  id: Generated<string>;
  org_id: string;
  slug: string;
  name: string;
  description: string | null;
  price_cents: number;
  billing_interval: 'year' | 'month' | 'lifetime' | 'one_time';
  duration_days: number | null;
  guest_passes_included: Generated<number>;
  member_only_event_access: Generated<boolean>;
  stripe_price_id: string | null;
  max_active: number | null;
  sort_order: Generated<number>;
  active: Generated<boolean>;
  deleted_at: Timestamp | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface MembershipsTable {
  id: Generated<string>;
  org_id: string;
  visitor_id: string;
  tier_id: string;
  status: 'pending' | 'active' | 'expired' | 'lapsed' | 'cancelled' | 'refunded';
  started_at: Timestamp | null;
  expires_at: Timestamp | null;
  auto_renew: Generated<boolean>;
  stripe_subscription_id: string | null;
  stripe_latest_invoice_id: string | null;
  cancelled_at: Timestamp | null;
  cancelled_reason: string | null;
  metadata: ColumnType<Jsonb, string, string>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface MembershipPaymentsTable {
  id: Generated<string>;
  membership_id: string;
  org_id: string;
  amount_cents: number;
  currency: string;
  source: 'manual' | 'stripe';
  stripe_charge_id: string | null;
  stripe_invoice_id: string | null;
  paid_at: Timestamp | null;
  refunded_at: Timestamp | null;
  refunded_amount_cents: number | null;
  notes: string | null;
  created_at: Generated<Timestamp>;
}

export interface GuestPassesTable {
  id: Generated<string>;
  membership_id: string;
  org_id: string;
  code: string;
  qr_token: Generated<string>;
  issued_at: Generated<Timestamp>;
  expires_at: Timestamp | null;
  redeemed_at: Timestamp | null;
  redeemed_by_visit_id: string | null;
}

export interface VisitorsTable {
  id: Generated<string>;
  org_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address: Jsonb | null;
  tags: Generated<string[]>;
  notes: string | null;
  stripe_customer_id: string | null;
  pii_redacted: Generated<boolean>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  deleted_at: Timestamp | null;
}

export interface VisitorSegmentsTable {
  id: Generated<string>;
  org_id: string;
  name: string;
  filter: ColumnType<Jsonb, string, string>;
  visitor_count: number | null;
  last_computed_at: Timestamp | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  deleted_at: Timestamp | null;
}

export interface OrgBookingPageTable {
  org_id: string;
  hero_title: string | null;
  hero_subtitle: string | null;
  hero_image_url: string | null;
  intro_markdown: string | null;
  confirmation_markdown: string | null;
  confirmation_redirect_url: string | null;
  show_policy_on_page: Generated<boolean>;
  lead_time_min_hours: Generated<number>;
  booking_window_days: Generated<number>;
  max_party_size: number | null;
  intake_schedules: Generated<boolean>;
  updated_at: Generated<Timestamp>;
}

export interface EventSeriesTable {
  id: Generated<string>;
  org_id: string;
  created_by: string;
  title: string;
  slug_base: string | null;
  frequency: 'weekly';
  weekday: number;
  first_starts_at: Timestamp;
  duration_minutes: number;
  until_date: ColumnType<string | Date | null, string | null, string | null>;
  occurrence_count: number | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface OrgBookingPoliciesTable {
  org_id: string;
  cancel_cutoff_hours: Generated<number>;
  reschedule_cutoff_hours: Generated<number>;
  self_cancel_enabled: Generated<boolean>;
  self_reschedule_enabled: Generated<boolean>;
  refund_policy_text: string | null;
  updated_at: Generated<Timestamp>;
}

export interface OrgsTable {
  id: Generated<string>;
  name: string;
  address: string;
  zip: string;
  country: Generated<string>;
  city: string | null;
  state: string | null;
  timezone: string;
  public_slug: string;
  slug_prefix: Generated<string>;
  slot_rounding: Generated<string>;
  kiosk_reset_seconds: Generated<number>;
  terminology: Generated<'appointment' | 'visit'>;
  time_model: Generated<'start_end' | 'start_only' | 'untimed'>;
  logo_url: string | null;
  theme: Generated<Jsonb>;
  form_fields: Generated<Jsonb>;
  is_demo: Generated<boolean>;
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
  country: string | null;
  city: string | null;
  state: string | null;
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
  series_id: string | null;
  series_ordinal: number | null;
  title: string;
  description: string | null;
  slug: string | null;
  public_id: string;
  starts_at: Timestamp;
  ends_at: Timestamp;
  capacity: number | null;
  waitlist_enabled: Generated<boolean>;
  waitlist_auto_promote: Generated<boolean>;
  membership_required_tier_id: string | null;
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
  visitor_id: string | null;
  booked_by: string | null;
  booking_method: 'self' | 'admin' | 'kiosk';
  scheduled_at: Timestamp;
  form_response: Jsonb;
  status: Generated<'confirmed' | 'cancelled' | 'no_show'>;
  cancelled_at: Timestamp | null;
  cancelled_by: string | null;
  pii_redacted: Generated<boolean>;
  idempotency_key: string | null;
  tags: Generated<string[]>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface WaitlistEntriesTable {
  id: Generated<string>;
  org_id: string;
  event_id: string;
  visitor_id: string | null;
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

export interface EventOutboxTable {
  id: Generated<string>;
  org_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: ColumnType<Jsonb, string, string>;
  status: Generated<'pending' | 'dispatched' | 'failed' | 'dead'>;
  attempts: Generated<number>;
  max_attempts: Generated<number>;
  last_error: string | null;
  available_at: Generated<Timestamp>;
  locked_by: string | null;
  locked_until: Timestamp | null;
  created_at: Generated<Timestamp>;
  dispatched_at: Timestamp | null;
}

export interface NotificationTemplatesTable {
  id: Generated<string>;
  org_id: string;
  template_key: string;
  subject: string;
  body_html: string;
  body_text: string;
  is_customized: Generated<boolean>;
  updated_at: Generated<Timestamp>;
}

export interface NotificationsOutboxTable {
  id: Generated<string>;
  org_id: string;
  kind: Generated<'email'>;
  to_address: string;
  template_key: string;
  rendered_subject: string;
  rendered_html: string;
  rendered_text: string;
  payload: ColumnType<Jsonb, string, string>;
  status: Generated<'pending' | 'sending' | 'sent' | 'failed' | 'suppressed' | 'dead'>;
  attempts: Generated<number>;
  max_attempts: Generated<number>;
  last_error: string | null;
  scheduled_at: Generated<Timestamp>;
  sent_at: Timestamp | null;
  provider_message_id: string | null;
  locked_by: string | null;
  locked_until: Timestamp | null;
  created_at: Generated<Timestamp>;
}

export interface NotificationSuppressionsTable {
  org_id: string;
  address: string;
  reason: string;
  created_at: Generated<Timestamp>;
}
