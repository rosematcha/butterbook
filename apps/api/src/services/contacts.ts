import { sql, type Tx } from '../db/index.js';

const EMAIL_KEYS = ['email', 'contact.email', 'contact_email'];
const FIRST_NAME_KEYS = ['first_name', 'firstName', 'contact.first_name'];
const LAST_NAME_KEYS = ['last_name', 'lastName', 'contact.last_name'];
const FULL_NAME_KEYS = ['name', 'full_name', 'fullName', 'contact.full_name'];
const PHONE_KEYS = ['phone', 'contact.phone'];

function firstString(form: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = form[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

function splitName(fullName: string | null): { firstName: string | null; lastName: string | null } {
  if (!fullName) return { firstName: null, lastName: null };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return { firstName: fullName.trim(), lastName: null };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) ?? null };
}

export function extractVisitorIdentity(formResponse: Record<string, unknown>): {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
} {
  const email = firstString(formResponse, EMAIL_KEYS)?.toLowerCase() ?? null;
  const explicitFirst = firstString(formResponse, FIRST_NAME_KEYS);
  const explicitLast = firstString(formResponse, LAST_NAME_KEYS);
  const split = splitName(firstString(formResponse, FULL_NAME_KEYS));
  return {
    email,
    firstName: explicitFirst ?? split.firstName,
    lastName: explicitLast ?? split.lastName,
    phone: firstString(formResponse, PHONE_KEYS),
  };
}

export async function upsertVisitorFromFormResponse(
  tx: Tx,
  orgId: string,
  formResponse: Record<string, unknown>,
): Promise<string | null> {
  const identity = extractVisitorIdentity(formResponse);
  if (!identity.email) return null;

  const row = await tx
    .insertInto('visitors')
    .values({
      org_id: orgId,
      email: identity.email,
      first_name: identity.firstName,
      last_name: identity.lastName,
      phone: identity.phone,
    })
    .onConflict((oc) =>
      oc
        .columns(['org_id', 'email'])
        .where('deleted_at', 'is', null)
        .doUpdateSet({
          first_name: sql`coalesce(visitors.first_name, excluded.first_name)`,
          last_name: sql`coalesce(visitors.last_name, excluded.last_name)`,
          phone: sql`coalesce(visitors.phone, excluded.phone)`,
          updated_at: new Date(),
        }),
    )
    .returning(['id'])
    .executeTakeFirst();

  return row?.id ?? null;
}

export function publicContact(row: {
  id: string;
  org_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address: unknown;
  tags: string[];
  notes: string | null;
  stripe_customer_id?: string | null;
  pii_redacted: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}) {
  return {
    id: row.id,
    orgId: row.org_id,
    email: row.pii_redacted ? null : row.email,
    firstName: row.pii_redacted ? null : row.first_name,
    lastName: row.pii_redacted ? null : row.last_name,
    phone: row.pii_redacted ? null : row.phone,
    address: row.pii_redacted ? null : row.address,
    tags: row.tags,
    notes: row.pii_redacted ? null : row.notes,
    piiRedacted: row.pii_redacted,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at?.toISOString() ?? null,
  };
}
