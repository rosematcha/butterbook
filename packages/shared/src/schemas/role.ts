import { z } from 'zod';
import { uuidSchema } from './primitives.js';
import { PERMISSIONS } from '../permissions/registry.js';

export const permissionSchema = z.enum(PERMISSIONS);

export const createRoleSchema = z
  .object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    permissions: z.array(permissionSchema).max(64).optional(),
  })
  .strict();

export const updateRoleSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
  })
  .strict();

export const putPermissionsSchema = z
  .object({
    permissions: z.array(permissionSchema).max(64),
  })
  .strict();

export const assignRoleSchema = z.object({ roleId: uuidSchema }).strict();

export const setSuperadminSchema = z.object({ isSuperadmin: z.boolean() }).strict();

export const createInvitationSchema = z
  .object({
    email: z.string().email().max(320),
    roleIds: z.array(uuidSchema).max(16).default([]),
    ttlHours: z.number().int().positive().max(720).default(168),
  })
  .strict();
