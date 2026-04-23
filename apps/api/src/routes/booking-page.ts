import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { updateBookingPageSchema, type BookingPageContent } from '@butterbook/shared';
import { withOrgContext, withOrgRead } from '../db/index.js';
import { NotFoundError } from '../errors/index.js';

const orgIdParam = z.object({ orgId: z.string().uuid() });

function rowToContent(row: {
  hero_title: string | null;
  hero_subtitle: string | null;
  hero_image_url: string | null;
  intro_markdown: string | null;
  confirmation_markdown: string | null;
  confirmation_redirect_url: string | null;
  show_policy_on_page: boolean;
  lead_time_min_hours: number;
  booking_window_days: number;
  max_party_size: number | null;
  intake_schedules: boolean;
}): BookingPageContent {
  return {
    heroTitle: row.hero_title,
    heroSubtitle: row.hero_subtitle,
    heroImageUrl: row.hero_image_url,
    introMarkdown: row.intro_markdown,
    confirmationMarkdown: row.confirmation_markdown,
    confirmationRedirectUrl: row.confirmation_redirect_url,
    showPolicyOnPage: row.show_policy_on_page,
    leadTimeMinHours: row.lead_time_min_hours,
    bookingWindowDays: row.booking_window_days,
    maxPartySize: row.max_party_size,
    intakeSchedules: row.intake_schedules,
  };
}

export function registerBookingPageRoutes(app: FastifyInstance): void {
  app.get('/api/v1/orgs/:orgId/booking-page', async (req) => {
    const { orgId } = orgIdParam.parse(req.params);
    await req.requirePermission(orgId, 'admin.manage_org');
    return withOrgRead(orgId, async (tx) => {
      const row = await tx
        .selectFrom('org_booking_page')
        .selectAll()
        .where('org_id', '=', orgId)
        .executeTakeFirst();
      if (!row) throw new NotFoundError();
      return { data: rowToContent(row) };
    });
  });

  app.patch('/api/v1/orgs/:orgId/booking-page', async (req) => {
    const { orgId } = orgIdParam.parse(req.params);
    const body = updateBookingPageSchema.parse(req.body);
    await req.requirePermission(orgId, 'admin.manage_org');
    const m = await req.loadMembershipFor(orgId);
    return withOrgContext(orgId, req.actorForOrg(orgId, m), async ({ tx, audit }) => {
      const updates: Record<string, unknown> = {};
      if (body.heroTitle !== undefined) updates.hero_title = body.heroTitle;
      if (body.heroSubtitle !== undefined) updates.hero_subtitle = body.heroSubtitle;
      if (body.heroImageUrl !== undefined) updates.hero_image_url = body.heroImageUrl;
      if (body.introMarkdown !== undefined) updates.intro_markdown = body.introMarkdown;
      if (body.confirmationMarkdown !== undefined) updates.confirmation_markdown = body.confirmationMarkdown;
      if (body.confirmationRedirectUrl !== undefined) updates.confirmation_redirect_url = body.confirmationRedirectUrl;
      if (body.showPolicyOnPage !== undefined) updates.show_policy_on_page = body.showPolicyOnPage;
      if (body.leadTimeMinHours !== undefined) updates.lead_time_min_hours = body.leadTimeMinHours;
      if (body.bookingWindowDays !== undefined) updates.booking_window_days = body.bookingWindowDays;
      if (body.maxPartySize !== undefined) updates.max_party_size = body.maxPartySize;
      if (body.intakeSchedules !== undefined) updates.intake_schedules = body.intakeSchedules;
      if (Object.keys(updates).length === 0) return { data: { ok: true } };
      updates.updated_at = new Date();

      const res = await tx
        .updateTable('org_booking_page')
        .set(updates)
        .where('org_id', '=', orgId)
        .returning(['org_id'])
        .executeTakeFirst();
      if (!res) {
        // Pre-backfill orgs: insert defaults + patched fields.
        await tx
          .insertInto('org_booking_page')
          .values({ org_id: orgId, ...updates } as never)
          .execute();
      }
      await audit({
        action: 'org.booking_page_updated',
        targetType: 'org',
        targetId: orgId,
        diff: { after: body },
      });
      return { data: { ok: true } };
    });
  });
}
