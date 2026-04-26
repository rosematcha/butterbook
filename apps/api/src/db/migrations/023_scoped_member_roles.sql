-- Add optional location scope to member_roles. When scope_location_id is NULL,
-- the role grants org-wide permissions. When set, permissions from that role
-- only apply to the specified location.

ALTER TABLE member_roles ADD COLUMN scope_location_id UUID REFERENCES locations(id);

-- Drop the old unique constraint and replace with one that includes the scope.
ALTER TABLE member_roles DROP CONSTRAINT member_roles_org_member_id_role_id_key;
ALTER TABLE member_roles ADD CONSTRAINT member_roles_org_member_role_scope_key
  UNIQUE (org_member_id, role_id, scope_location_id);
