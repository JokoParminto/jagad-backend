-- Migration 035: Grant Printer Permissions to Owner Role
-- Purpose: Owner was missing from printer permission grants in migration 028

INSERT INTO role_permissions (role, permission_id)
SELECT 'owner', id FROM permissions WHERE name LIKE 'printer:%'
ON CONFLICT (role, permission_id) DO NOTHING;
