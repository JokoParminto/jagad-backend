-- Migration 034: Make customer phone_number optional
-- phone_number was NOT NULL, now allow NULL for walk-in customers added from kasir

ALTER TABLE customers
  ALTER COLUMN phone_number DROP NOT NULL;
