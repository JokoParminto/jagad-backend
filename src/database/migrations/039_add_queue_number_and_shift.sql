-- Migration 039: Add queue_number and shift_id to preparation_queue
-- queue_number: sequential per shift (resets to 1 on new shift)
-- shift_id: FK to shifts — used to scope queue_number per shift

ALTER TABLE preparation_queue
  ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS queue_number INT;

CREATE INDEX IF NOT EXISTS idx_preparation_queue_shift ON preparation_queue(shift_id);
