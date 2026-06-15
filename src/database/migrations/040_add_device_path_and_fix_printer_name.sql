-- Migration 040: Add device_path back + drop unique constraint on printer name
-- device_path was dropped in 033 but is needed for Bluetooth printer MAC address
-- name UNIQUE constraint is dropped because multiple printers can share a brand name

BEGIN;

ALTER TABLE printers
  ADD COLUMN IF NOT EXISTS device_path VARCHAR(255);

ALTER TABLE printers
  DROP CONSTRAINT IF EXISTS printers_name_key;

COMMIT;
