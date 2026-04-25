'use client';

export type MembershipBillingInterval = 'year' | 'month' | 'lifetime' | 'one_time';
export type MembershipStatus = 'pending' | 'active' | 'expired' | 'lapsed' | 'cancelled' | 'refunded';

export interface MembershipTier {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceCents: number;
  billingInterval: MembershipBillingInterval;
  durationDays: number | null;
  guestPassesIncluded: number;
  memberOnlyEventAccess: boolean;
  maxActive: number | null;
  sortOrder: number;
  active: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Membership {
  id: string;
  visitorId: string;
  tierId: string;
  status: MembershipStatus;
  startedAt: string | null;
  expiresAt: string | null;
  autoRenew: boolean;
  cancelledAt: string | null;
  cancelledReason: string | null;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
  visitor: {
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  tier: {
    slug: string;
    name: string;
    priceCents: number;
    billingInterval: MembershipBillingInterval;
  };
}

export interface MembershipListResponse {
  data: Membership[];
  meta: { page: number; limit: number; total: number; pages: number };
}

export interface MembershipPolicy {
  enabled: boolean;
  gracePeriodDays: number;
  renewalReminderDays: number[];
  selfCancelEnabled: boolean;
  selfUpdateEnabled: boolean;
  publicPageEnabled: boolean;
}

export type PromoCodeDiscountType = 'percent' | 'amount';

export interface PromoCode {
  id: string;
  code: string;
  description: string | null;
  discountType: PromoCodeDiscountType;
  discountPercent: number | null;
  discountAmountCents: number | null;
  membershipTierId: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  maxRedemptions: number | null;
  redeemedCount: number;
  active: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function memberName(member: Membership): string {
  const name = [member.visitor.firstName, member.visitor.lastName].filter(Boolean).join(' ').trim();
  return name || member.visitor.email;
}

export function money(cents: number): string {
  return new Intl.NumberFormat([], { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
}

export function intervalLabel(interval: MembershipBillingInterval): string {
  if (interval === 'one_time') return 'one-time';
  return interval;
}

export function statusClass(status: MembershipStatus): string {
  if (status === 'active') return 'badge-accent';
  if (status === 'cancelled' || status === 'refunded') return 'badge';
  return 'badge';
}
