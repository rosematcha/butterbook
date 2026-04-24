'use client';

export interface Contact {
  id: string;
  orgId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  address: unknown;
  tags: string[];
  notes: string | null;
  piiRedacted: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ContactListResponse {
  data: Contact[];
  meta: { page: number; limit: number; total: number; pages: number };
}

export interface Segment {
  id: string;
  orgId: string;
  name: string;
  filter: SegmentFilter;
  visitorCount: number | null;
  lastComputedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SegmentFilter =
  | { and: SegmentFilter[] }
  | { or: SegmentFilter[] }
  | { tag: string }
  | { emailDomain: string }
  | { visitedAfter: string }
  | { visitedBefore: string }
  | { hasMembership: boolean };

export type TimelineItem =
  | {
      type: 'visit';
      id: string;
      at: string;
      status: string;
      bookingMethod: string;
      eventId: string | null;
    }
  | {
      type: 'waitlist';
      id: string;
      at: string;
      status: string;
      eventId: string | null;
      promotedAt: string | null;
    }
  | {
      type: 'notification';
      id: string;
      at: string;
      templateKey: string;
      status: string;
      scheduledAt: string;
      sentAt: string | null;
    };

export function contactName(contact: Contact): string {
  if (contact.piiRedacted) return 'Redacted contact';
  const joined = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
  return joined || contact.email || 'Unnamed contact';
}

export function tagsFromText(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

export function describeFilter(filter: SegmentFilter): string {
  if ('tag' in filter) return `tag is "${filter.tag}"`;
  if ('emailDomain' in filter) return `email domain is ${filter.emailDomain}`;
  if ('visitedAfter' in filter) return `visited after ${new Date(filter.visitedAfter).toLocaleDateString()}`;
  if ('visitedBefore' in filter) return `visited before ${new Date(filter.visitedBefore).toLocaleDateString()}`;
  if ('hasMembership' in filter) return filter.hasMembership ? 'has membership' : 'does not have membership';
  if ('and' in filter) return filter.and.map(describeFilter).join(' and ');
  return filter.or.map(describeFilter).join(' or ');
}
