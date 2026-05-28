-- Migration 017: Split Bill Schema - Status Update
-- Description: Update transaction status from (draft, completed, cancelled) to (open, partial_paid, paid, cancelled)

-- ============================================================
-- PART 1: Update transactions table status
-- ============================================================

-- Drop old CHECK constraint FIRST
ALTER TABLE transactions
DROP CONSTRAINT IF EXISTS transactions_status_check;

-- Map old status to new status for transactions
UPDATE transactions
SET status = 'open' WHERE status = 'draft';

UPDATE transactions  
SET status = 'paid' WHERE status = 'completed';

-- cancelled remains unchanged

-- Add new CHECK constraint with split bill status values
ALTER TABLE transactions
ADD CONSTRAINT transactions_status_check 
CHECK (status IN ('open', 'partial_paid', 'paid', 'cancelled'));

-- Update column comment
COMMENT ON COLUMN transactions.status IS 'Transaction status: open (new order, no payments), partial_paid (some payments received), paid (fully paid), cancelled (cancelled)';


-- ============================================================
-- PART 2: Update transaction_temporary table status (held orders)
-- ============================================================

-- Add status column to transaction_temporary if it doesn't exist
ALTER TABLE transaction_temporary
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'open';

-- Drop old CHECK constraint if exists
ALTER TABLE transaction_temporary
DROP CONSTRAINT IF EXISTS transaction_temporary_status_check;

-- Add CHECK constraint
ALTER TABLE transaction_temporary
ADD CONSTRAINT transaction_temporary_status_check 
CHECK (status IN ('open', 'partial_paid', 'paid', 'cancelled'));

-- Update column comment
COMMENT ON COLUMN transaction_temporary.status IS 'Held order status: open (new order), partial_paid (some payments), paid (fully paid), cancelled (cancelled)';


-- ============================================================
-- PART 3: Verification
-- ============================================================

-- Verify status update
-- SELECT COUNT(*) as open_count FROM transactions WHERE status = 'open';
-- SELECT COUNT(*) as paid_count FROM transactions WHERE status = 'paid';
-- SELECT COUNT(*) as cancelled_count FROM transactions WHERE status = 'cancelled';
-- SELECT DISTINCT status FROM transactions;

COMMENT ON TABLE transactions IS 'Updated: status now supports split bill (open, partial_paid, paid, cancelled)';
COMMENT ON TABLE transaction_temporary IS 'Updated: status now supports split bill for held orders';
