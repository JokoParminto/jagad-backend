-- Migration 038: Per-item status + soft delete for preparation_queue
-- Changes:
--   1. Add is_active (soft delete flag) to preparation_queue
--   2. Drop order-level status column (replaced by per-item status in items JSONB)
--   3. Migrate existing items JSONB to add status:'pending' per item
--   4. Drop queue_delivered from transactions (no longer needed)

-- 1. Add is_active
ALTER TABLE preparation_queue ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_preparation_queue_is_active
  ON preparation_queue(is_active) WHERE is_active = true;

-- 2. Migrate existing items → add status:'pending' to each item
UPDATE preparation_queue
SET items = (
  SELECT COALESCE(
    jsonb_agg(item || '{"status": "pending"}'::jsonb ORDER BY ordinality),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(items) WITH ORDINALITY AS t(item, ordinality)
)
WHERE jsonb_array_length(items) > 0;

-- 3. Drop order-level status column
ALTER TABLE preparation_queue DROP COLUMN IF EXISTS status;

-- 4. Drop queue_delivered from transactions
ALTER TABLE transactions DROP COLUMN IF EXISTS queue_delivered;
