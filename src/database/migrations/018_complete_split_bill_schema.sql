-- Migration 018: Complete Split Bill Schema
-- Description: Add all necessary columns and create transaction_payments table for split bill support

-- ============================================================
-- PART 1: Add split bill support columns to transactions table
-- ============================================================

-- Add version_number for optimistic locking (prevent concurrent update conflicts)
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS version_number INTEGER DEFAULT 1;

-- Add remaining_amount for performance (cached remaining balance)
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS remaining_amount DECIMAL(15,2);

-- Add paid_at timestamp for when transaction was fully paid
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;

-- Create indexes for split bill queries
CREATE INDEX IF NOT EXISTS idx_transactions_version ON transactions(version_number);
CREATE INDEX IF NOT EXISTS idx_transactions_remaining ON transactions(remaining_amount);
CREATE INDEX IF NOT EXISTS idx_transactions_paid_at ON transactions(paid_at);


-- ============================================================
-- PART 2: Add split bill support columns to transaction_temporary table
-- ============================================================

-- Add version_number for optimistic locking
ALTER TABLE transaction_temporary
ADD COLUMN IF NOT EXISTS version_number INTEGER DEFAULT 1;

-- Add remaining_amount for performance
ALTER TABLE transaction_temporary
ADD COLUMN IF NOT EXISTS remaining_amount DECIMAL(15,2);

-- Add paid_at timestamp
ALTER TABLE transaction_temporary
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_transaction_temporary_version ON transaction_temporary(version_number);
CREATE INDEX IF NOT EXISTS idx_transaction_temporary_remaining ON transaction_temporary(remaining_amount);


-- ============================================================
-- PART 3: Add payment_status to transaction_items table
-- ============================================================

-- Add payment_status column to track which items have been paid
ALTER TABLE transaction_items
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'unpaid' 
CHECK (payment_status IN ('unpaid', 'paid'));

-- Create index for payment_status queries
CREATE INDEX IF NOT EXISTS idx_transaction_items_payment_status 
ON transaction_items(payment_status);

-- Add comment
COMMENT ON COLUMN transaction_items.payment_status IS 'Payment status of item: unpaid (not yet paid) or paid (fully paid in split bill)';


-- ============================================================
-- PART 4: Add payment_status to transaction_item_temporary table
-- ============================================================

-- Add payment_status column for held order items
ALTER TABLE transaction_item_temporary
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'unpaid' 
CHECK (payment_status IN ('unpaid', 'paid'));

-- Create index
CREATE INDEX IF NOT EXISTS idx_transaction_item_temporary_payment_status 
ON transaction_item_temporary(payment_status);

-- Add comment
COMMENT ON COLUMN transaction_item_temporary.payment_status IS 'Payment status for held order items';


-- ============================================================
-- PART 5: Create transaction_payments table for payment tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS transaction_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  
  amount_paid DECIMAL(15,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
  
  -- JSON array of paid items: [{item_id: UUID, quantity: INTEGER}, ...]
  paid_items_json JSONB NOT NULL,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Idempotency key to prevent duplicate submissions
  idempotency_key VARCHAR(100) UNIQUE
);

-- Create indexes for transaction_payments
CREATE INDEX IF NOT EXISTS idx_transaction_payments_transaction 
ON transaction_payments(transaction_id);

CREATE INDEX IF NOT EXISTS idx_transaction_payments_method 
ON transaction_payments(payment_method_id);

CREATE INDEX IF NOT EXISTS idx_transaction_payments_date 
ON transaction_payments(created_at);

CREATE INDEX IF NOT EXISTS idx_transaction_payments_idempotency 
ON transaction_payments(idempotency_key);

-- Create trigger for updated_at on transaction_payments
CREATE OR REPLACE FUNCTION update_transaction_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_transaction_payments_updated_at ON transaction_payments;
CREATE TRIGGER trigger_transaction_payments_updated_at BEFORE UPDATE ON transaction_payments
FOR EACH ROW
EXECUTE FUNCTION update_transaction_payments_updated_at();

-- Comments for documentation
COMMENT ON TABLE transaction_payments IS 'Tracks individual payments made against a transaction for split bill support';
COMMENT ON COLUMN transaction_payments.amount_paid IS 'Amount paid in this payment transaction';
COMMENT ON COLUMN transaction_payments.payment_method IS 'Payment method used (cash, qris, transfer, etc.)';
COMMENT ON COLUMN transaction_payments.paid_items_json IS 'JSON array of items paid in this payment: [{item_id, quantity}, ...]';
COMMENT ON COLUMN transaction_payments.idempotency_key IS 'Unique key to prevent duplicate payment submissions';


-- ============================================================
-- PART 6: Initialize remaining_amount for existing transactions
-- ============================================================

-- Set remaining_amount = total for all transactions
UPDATE transactions
SET remaining_amount = total
WHERE remaining_amount IS NULL;

-- Set version_number = 1 for existing transactions
UPDATE transactions
SET version_number = 1
WHERE version_number IS NULL;

-- Do the same for transaction_temporary
UPDATE transaction_temporary
SET remaining_amount = total
WHERE remaining_amount IS NULL;

UPDATE transaction_temporary
SET version_number = 1
WHERE version_number IS NULL;


-- ============================================================
-- PART 7: Helper functions for split bill operations
-- ============================================================

-- Function to get total paid amount for a transaction
CREATE OR REPLACE FUNCTION get_transaction_total_paid(transaction_uuid UUID)
RETURNS DECIMAL(15,2) AS $$
DECLARE
  total_paid DECIMAL(15,2);
BEGIN
  SELECT COALESCE(SUM(amount_paid), 0)
  INTO total_paid
  FROM transaction_payments
  WHERE transaction_id = transaction_uuid;
  
  RETURN total_paid;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_transaction_total_paid IS 'Calculate total amount paid for a transaction from all payments';


-- Function to update remaining_amount for a transaction
CREATE OR REPLACE FUNCTION update_transaction_remaining_amount(transaction_uuid UUID)
RETURNS DECIMAL(15,2) AS $$
DECLARE
  remaining DECIMAL(15,2);
  total_paid DECIMAL(15,2);
  txn_total DECIMAL(15,2);
BEGIN
  -- Get transaction total
  SELECT total INTO txn_total FROM transactions WHERE id = transaction_uuid;
  
  -- Get total paid
  SELECT get_transaction_total_paid(transaction_uuid) INTO total_paid;
  
  -- Calculate remaining
  remaining := txn_total - total_paid;
  
  -- Update transaction
  UPDATE transactions
  SET remaining_amount = remaining
  WHERE id = transaction_uuid;
  
  RETURN remaining;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_transaction_remaining_amount IS 'Update remaining_amount field for a transaction after payment';


-- ============================================================
-- PART 8: Helper view for transaction payment summary
-- ============================================================

CREATE OR REPLACE VIEW transaction_payment_summary AS
SELECT
  t.id as transaction_id,
  t.transaction_number,
  t.total,
  get_transaction_total_paid(t.id) as total_paid,
  t.remaining_amount as remaining_cached,
  (t.total - get_transaction_total_paid(t.id)) as remaining_calculated,
  CASE
    WHEN get_transaction_total_paid(t.id) >= t.total THEN 'paid'
    WHEN get_transaction_total_paid(t.id) > 0 THEN 'partial_paid'
    ELSE 'open'
  END as payment_status,
  t.status,
  t.version_number,
  (SELECT COUNT(*) FROM transaction_payments WHERE transaction_id = t.id) as payment_count,
  t.created_at,
  t.paid_at
FROM transactions t;

COMMENT ON VIEW transaction_payment_summary IS 'Summary view for transaction payment tracking and status';


-- ============================================================
-- PART 9: Add comments to updated tables
-- ============================================================

COMMENT ON COLUMN transactions.version_number IS 'Version number for optimistic locking (increment on each update)';
COMMENT ON COLUMN transactions.remaining_amount IS 'Remaining amount to be paid (cached for performance)';
COMMENT ON COLUMN transactions.paid_at IS 'Timestamp when transaction was fully paid (split bill support)';

COMMENT ON COLUMN transaction_temporary.version_number IS 'Version number for optimistic locking';
COMMENT ON COLUMN transaction_temporary.remaining_amount IS 'Remaining amount for held order';
COMMENT ON COLUMN transaction_temporary.paid_at IS 'When held order was fully paid';

COMMENT ON TABLE transactions IS 'Updated: now supports split bill with version_number, remaining_amount, paid_at';
COMMENT ON TABLE transaction_temporary IS 'Updated: now supports split bill for held orders';
COMMENT ON TABLE transaction_items IS 'Updated: now includes payment_status for split bill tracking';
COMMENT ON TABLE transaction_item_temporary IS 'Updated: now includes payment_status for held order items';
