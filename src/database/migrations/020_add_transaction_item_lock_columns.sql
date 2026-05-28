-- Migration 020: Add lock columns for transaction_items
-- Description: Track paid item locking metadata
-- Date: 2026-02-13

ALTER TABLE transaction_items
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP NULL;

ALTER TABLE transaction_items
  ADD COLUMN IF NOT EXISTS locked_by_payment_id UUID NULL;

COMMENT ON COLUMN transaction_items.locked_at IS 'Timestamp when item was locked after payment';
COMMENT ON COLUMN transaction_items.locked_by_payment_id IS 'Payment ID that locked this item';
