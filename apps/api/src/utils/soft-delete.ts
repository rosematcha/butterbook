import type { FastifyRequest } from 'fastify';
import { PermissionError } from '../errors/index.js';

// Gate for SPEC §1.2 rule 6: soft-deleted records are returned only when
// `include_deleted=true` AND the caller is a superadmin of the org.
//
// Returns `true` only when both conditions hold; otherwise `false`. Throws
// 403 if the caller asked for deleted rows but is not a superadmin.
export async function allowIncludeDeleted(
  req: FastifyRequest,
  orgId: string,
  param: 'true' | 'false' | undefined,
): Promise<boolean> {
  if (param !== 'true') return false;
  req.requireAuth();
  const m = await req.loadMembershipFor(orgId);
  if (!m.isSuperadmin) {
    throw new PermissionError('include_deleted requires a superadmin caller.');
  }
  return true;
}
