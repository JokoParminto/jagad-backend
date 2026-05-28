-- Migration 028: Add Printer-Related Permissions
-- Purpose: Add printer management permissions to RBAC system

-- Insert printer permissions
INSERT INTO permissions (name, description) VALUES
  ('printer:read', 'Lihat daftar printer dan konfigurasi'),
  ('printer:create', 'Tambah printer baru'),
  ('printer:update', 'Edit konfigurasi printer'),
  ('printer:delete', 'Hapus printer'),
  ('printer:manage_templates', 'Buat dan edit template cetak'),
  ('printer:test_print', 'Jalankan test print'),
  ('printer:view_history', 'Lihat riwayat print jobs')
ON CONFLICT (name) DO NOTHING;

-- Grant admin all printer permissions
INSERT INTO role_permissions (role, permission_id)
SELECT 'admin', id FROM permissions WHERE name LIKE 'printer:%'
ON CONFLICT (role, permission_id) DO NOTHING;

-- Grant manager read and test permissions (no create/update/delete)
INSERT INTO role_permissions (role, permission_id)
SELECT 'manager', id FROM permissions 
WHERE name IN ('printer:read', 'printer:test_print', 'printer:view_history')
ON CONFLICT (role, permission_id) DO NOTHING;

-- Kasir can only read and test print (no management)
INSERT INTO role_permissions (role, permission_id)
SELECT 'kasir', id FROM permissions 
WHERE name IN ('printer:read', 'printer:test_print')
ON CONFLICT (role, permission_id) DO NOTHING;
