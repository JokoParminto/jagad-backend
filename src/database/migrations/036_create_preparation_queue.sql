-- Migration 036: Create preparation_queue table
-- Purpose: Track barista production queue combining hold orders and paid transactions.
-- Only 3 active statuses (waiting/making/ready). Record deleted when order is delivered — no garbage data.

CREATE TABLE IF NOT EXISTS preparation_queue (
  id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_ref_id    UUID          NOT NULL,
  order_type      VARCHAR(10)   NOT NULL CHECK (order_type IN ('hold', 'paid')),
  transaction_number VARCHAR(60),
  customer_name   VARCHAR(255)  NOT NULL DEFAULT 'Tanpa Nama',
  items           JSONB         NOT NULL DEFAULT '[]',
  status          VARCHAR(20)   NOT NULL DEFAULT 'waiting'
                                CHECK (status IN ('waiting', 'making', 'ready')),
  ordered_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Backfill: jika tabel sudah ada dari versi lama tanpa kolom status
ALTER TABLE preparation_queue ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'waiting';
ALTER TABLE preparation_queue ADD COLUMN IF NOT EXISTS transaction_number VARCHAR(60);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'preparation_queue_status_check'
      AND conrelid = 'preparation_queue'::regclass
  ) THEN
    ALTER TABLE preparation_queue
      ADD CONSTRAINT preparation_queue_status_check
      CHECK (status IN ('waiting', 'making', 'ready'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_preparation_queue_status     ON preparation_queue(status);
CREATE INDEX IF NOT EXISTS idx_preparation_queue_ordered_at ON preparation_queue(ordered_at);
CREATE INDEX IF NOT EXISTS idx_preparation_queue_ref        ON preparation_queue(order_ref_id);

CREATE OR REPLACE FUNCTION update_preparation_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_preparation_queue_updated_at ON preparation_queue;
CREATE TRIGGER trg_preparation_queue_updated_at
  BEFORE UPDATE ON preparation_queue
  FOR EACH ROW EXECUTE FUNCTION update_preparation_queue_updated_at();
