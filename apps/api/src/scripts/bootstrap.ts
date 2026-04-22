#!/usr/bin/env tsx
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadConfig } from '../config.js';
import { closeDb, getDb } from '../db/index.js';
import { createOrgWithOwner } from '../services/orgs.js';
import { checkPasswordPolicy, hashPassword } from '../utils/passwords.js';
import { ianaTimezoneSchema } from '@butterbook/shared';

interface Args {
  email: string;
  orgName: string;
  orgAddress: string;
  orgZip: string;
  timezone: string;
  publicSlug?: string;
  force: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Record<string, string> = {};
  let force = false;
  for (const a of argv) {
    if (a === '--force') force = true;
    else if (a.startsWith('--')) {
      const [k, ...rest] = a.slice(2).split('=');
      args[k!] = rest.join('=');
    }
  }
  const req = (k: string): string => {
    const v = args[k];
    if (!v) {
      // eslint-disable-next-line no-console
      console.error(`Missing --${k}`);
      process.exit(1);
    }
    return v;
  };
  return {
    email: req('email'),
    orgName: req('org-name'),
    orgAddress: req('org-address'),
    orgZip: req('org-zip'),
    timezone: req('timezone'),
    ...(args['public-slug'] ? { publicSlug: args['public-slug'] } : {}),
    force,
  };
}

async function promptPassword(): Promise<string> {
  const rl = readline.createInterface({ input: stdin, output: stdout, terminal: true });
  const pw = await rl.question('Password (min 12 chars): ');
  rl.close();
  return pw.trim();
}

async function main(): Promise<void> {
  loadConfig();
  const args = parseArgs(process.argv.slice(2));
  ianaTimezoneSchema.parse(args.timezone);

  const db = getDb();
  const anySuper = await db
    .selectFrom('org_members')
    .select('id')
    .where('is_superadmin', '=', true)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (anySuper && !args.force) {
    // eslint-disable-next-line no-console
    console.error('A superadmin already exists. Pass --force to bypass.');
    process.exit(1);
  }

  const password = await promptPassword();
  checkPasswordPolicy(password);

  let userId: string;
  const existingUser = await db.selectFrom('users').select('id').where('email', '=', args.email).executeTakeFirst();
  if (existingUser) {
    const existingMembership = await db
      .selectFrom('org_members')
      .select('id')
      .where('user_id', '=', existingUser.id)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (existingMembership) {
      // eslint-disable-next-line no-console
      console.error(`User ${args.email} already belongs to an organization.`);
      process.exit(1);
    }
    userId = existingUser.id;
  } else {
    const hash = await hashPassword(password);
    const u = await db.insertInto('users').values({ email: args.email, password_hash: hash }).returning(['id']).executeTakeFirstOrThrow();
    userId = u.id;
  }

  const slug = args.publicSlug ?? args.orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  await createOrgWithOwner({
    name: args.orgName,
    address: args.orgAddress,
    zip: args.orgZip,
    timezone: args.timezone,
    publicSlug: slug,
    ownerUserId: userId,
    actor: {
      userId,
      orgId: null,
      isSuperadmin: true,
      permissions: new Set(),
      actorType: 'system',
      ip: null,
      userAgent: 'bootstrap-cli',
    },
  });

  // eslint-disable-next-line no-console
  console.log(`Created org (slug=${slug}) with superadmin ${args.email}`);
  await closeDb();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
