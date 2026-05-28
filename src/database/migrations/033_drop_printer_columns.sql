-- Migration 033: Drop unnecessary columns from printers table
-- Purpose: Remove columns that are not used in printer configuration

BEGIN;

-- Drop columns from printers table
ALTER TABLE printers
  DROP COLUMN IF EXISTS ip_address,
  DROP COLUMN IF EXISTS port_number,
  DROP COLUMN IF EXISTS device_path,
  DROP COLUMN IF EXISTS paper_height,
  DROP COLUMN IF EXISTS dpi;

COMMIT;
