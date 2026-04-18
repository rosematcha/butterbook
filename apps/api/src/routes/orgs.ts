import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createOrgSchema,
  putFormSchema,
  updateBrandingSchema,
  updateOrgSchema,
  slugSchema,
} from '@butterbook/shared';
import { getDb, withOrgContext, withOrgRead } from '../db/index.js';
import { createOrgWithOwner } from '../services/orgs.js';
import { ConflictError, NotFoundError } from '../errors/index.js';

const orgIdParam = z.object({ orgId: z.string().uuid() });

export function registerOrgRoutes(app: FastifyInstance): void {
  app.post('/api/v1/orgs', async (req) => {
    req.requireAuth();
    const body = createOrgSchema.parse(req.body);
    const publicSlug = body.publicSlug ?? (await generateSlug(body.name));
    slugSchema.parse(publicSlug);
    const { orgId } = await createOrgWithOwner({
      ...body,
      publicSlug,
      ownerUserId: req.userId!,
      actor: req.actor(),
    });
    return { data: { id: orgId, publicSlug } };
  });

  app.get('/api/v1/orgs/:orgId', async (req) => {
    const { orgId } = orgIdParam.parse(req.params);
    req.requireAuth();
    await req.loadMembershipFor(orgId);
    // orgs is NOT an RLS-enabled table (per spec §4.4), so getDb() is correct here.
    const org = await getDb().selectFrom('orgs').selectAll().where('id', '=', orgId).where('deleted_at', 'is', null).executeTakeFirst();
    if (!org) throw new NotFoundError();
    return { data: publicOrg(org) };
  });

  app.patch('/api/v1/orgs/:orgId', async (req) => {
    const { orgId } = orgIdParam.parse(req.params);
    const body = updateOrgSchema.parse(req.body);
    await req.requirePermission(orgId, 'admin.manage_org');
    const m = await req.loadMembershipFor(orgId);

    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      if (body.publicSlug) {
        const conflict = await getDb()
          .selectFrom('orgs')
          .select('id')
          .where('public_slug', '=', body.publicSlug)
          .where('id', '!=', orgId)
          .executeTakeFirst();
        if (conflict) throw new ConflictError('publicSlug already in use.');
      }
      const updates: Record<string, unknown> = {};
      if (body.name !== undefined) updates.name = body.name;
      if (body.address !== undefined) updates.address = body.address;
      if (body.zip !== undefined) updates.zip = body.zip;
      if (body.timezone !== undefined) updates.timezone = body.timezone;
      if (body.slugPrefix !== undefined) updates.slug_prefix = body.slugPrefix;
      if (body.slotRounding !== undefined) updates.slot_rounding = body.slotRounding;
      if (body.kioskResetSeconds !== undefined) updates.kiosk_reset_seconds = body.kioskResetSeconds;
      if (body.publicSlug !== undefined) updates.public_slug = body.publicSlug;
      if (Object.keys(updates).length > 0) {
        const res = await tx.updateTable('orgs').set(updates).where('id', '=', orgId).returning(['id']).executeTakeFirst();
        if (!res) throw new NotFoundError();
      }
      await audit({ action: 'org.updated', targetType: 'org', targetId: orgId, diff: { after: updates } });
      const fresh = await tx.selectFrom('orgs').selectAll().where('id', '=', orgId).executeTakeFirstOrThrow();
      return { data: publicOrg(fresh) };
    });
  });

  app.delete('/api/v1/orgs/:orgId', async (req) => {
    const { orgId } = orgIdParam.parse(req.params);
    await req.requireSuperadmin(orgId);
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      await tx.updateTable('orgs').set({ deleted_at: new Date() }).where('id', '=', orgId).execute();
      await audit({ action: 'org.deleted', targetType: 'org', targetId: orgId });
      return { data: { ok: true } };
    });
  });

  app.get('/api/v1/orgs/:orgId/branding', async (req) => {
    const { orgId } = orgIdParam.parse(req.params);
    const org = await getDb()
      .selectFrom('orgs')
      .select(['id', 'name', 'public_slug', 'logo_url', 'theme'])
      .where('id', '=', orgId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (!org) throw new NotFoundError();
    return {
      data: {
        id: org.id,
        name: org.name,
        publicSlug: org.public_slug,
        logoUrl: org.logo_url,
        theme: org.theme,
      },
    };
  });

  app.patch('/api/v1/orgs/:orgId/branding', async (req) => {
    const { orgId } = orgIdParam.parse(req.params);
    const body = updateBrandingSchema.parse(req.body);
    await req.requirePermission(orgId, 'admin.manage_org');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const updates: Record<string, unknown> = {};
      if (body.logoUrl !== undefined) updates.logo_url = body.logoUrl;
      if (body.theme !== undefined) updates.theme = body.theme;
      if (Object.keys(updates).length > 0) {
        await tx.updateTable('orgs').set(updates).where('id', '=', orgId).execute();
      }
      await audit({ action: 'org.branding_updated', targetType: 'org', targetId: orgId, diff: { after: updates } });
      return { data: { ok: true } };
    });
  });

  app.get('/api/v1/orgs/:orgId/form', async (req) => {
    const { orgId } = orgIdParam.parse(req.params);
    await req.requirePermission(orgId, 'admin.manage_forms');
    return withOrgRead(orgId, async (tx) => {
      const org = await tx.selectFrom('orgs').select(['form_fields']).where('id', '=', orgId).executeTakeFirstOrThrow();
      return { data: { fields: org.form_fields } };
    });
  });

  app.put('/api/v1/orgs/:orgId/form', async (req) => {
    const { orgId } = orgIdParam.parse(req.params);
    const body = putFormSchema.parse(req.body);
    await req.requirePermission(orgId, 'admin.manage_forms');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      await tx.updateTable('orgs').set({ form_fields: JSON.stringify(body.fields) }).where('id', '=', orgId).execute();
      await audit({ action: 'org.form_updated', targetType: 'org', targetId: orgId });
      return { data: { fields: body.fields } };
    });
  });
}

function publicOrg(o: {
  id: string;
  name: string;
  address: string;
  zip: string;
  timezone: string;
  public_slug: string;
  slug_prefix: string;
  slot_rounding: string;
  kiosk_reset_seconds: number;
  logo_url: string | null;
  theme: unknown;
  form_fields: unknown;
}) {
  return {
    id: o.id,
    name: o.name,
    address: o.address,
    zip: o.zip,
    timezone: o.timezone,
    publicSlug: o.public_slug,
    slugPrefix: o.slug_prefix,
    slotRounding: o.slot_rounding,
    kioskResetSeconds: o.kiosk_reset_seconds,
    logoUrl: o.logo_url,
    theme: o.theme,
    formFields: o.form_fields,
  };
}

async function generateSlug(name: string): Promise<string> {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'org';
  let candidate = base;
  for (let i = 2; i < 100; i++) {
    const existing = await getDb().selectFrom('orgs').select('id').where('public_slug', '=', candidate).executeTakeFirst();
    if (!existing) return candidate;
    candidate = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}
