# Permissions

The canonical registry is `packages/shared/src/permissions/registry.ts`. Every route declares the permission it requires; the permission check decorator (`req.requirePermission`) short-circuits to `true` for superadmins.

See `SPEC.md §5`. Adding a new permission: add the string to `PERMISSIONS`, update the relevant route, ship a migration-free deploy (no DB changes). Removing a permission is a multi-step rollout (remove references, then remove the literal).
