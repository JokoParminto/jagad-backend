-- Migration 037: Add queue_delivered flag to transactions
-- Purpose: Track hold orders that have been physically delivered to customer.
-- When kasir taps "Sudah Diantar" in the barista queue:
--   - preparation_queue record is DELETED (no garbage data)
--   - queue_delivered = true is SET on the transaction
-- syncMissingHoldOrders() skips transactions with queue_delivered = true
-- so they don't reappear in the queue after reload.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS queue_delivered BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_transactions_queue_delivered
  ON transactions(queue_delivered) WHERE queue_delivered = false;
