-- Migration 016: Add Payment Method FK and Promo Tracking
-- Description: Add payment_method_id FK, promo tracking, and member savings calculations

-- ============================================================
-- PART 1: Add member_savings to transaction items
-- ============================================================

-- Add member_savings to transaction_items
ALTER TABLE transaction_items
ADD COLUMN IF NOT EXISTS member_savings DECIMAL(15,2) DEFAULT 0;

-- Add member_savings to transaction_item_temporary
ALTER TABLE transaction_item_temporary
ADD COLUMN IF NOT EXISTS member_savings DECIMAL(15,2) DEFAULT 0;

-- Create index for member savings reporting
CREATE INDEX IF NOT EXISTS idx_transaction_items_member_savings
ON transaction_items(member_savings) WHERE member_savings > 0;

-- Comments
COMMENT ON COLUMN transaction_items.member_savings IS 'Amount saved when member price was applied (original_price - product_price)';
COMMENT ON COLUMN transaction_item_temporary.member_savings IS 'Amount saved when member price was applied for held orders';


-- ============================================================
-- PART 2: Add total member savings and customer member flag to transactions
-- ============================================================

-- Add total_member_savings to transactions
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS total_member_savings DECIMAL(15,2) DEFAULT 0;

-- Add customer_is_member to transactions (denormalized for faster reporting)
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS customer_is_member BOOLEAN DEFAULT FALSE;

-- Add total_member_savings to transaction_temporary
ALTER TABLE transaction_temporary
ADD COLUMN IF NOT EXISTS total_member_savings DECIMAL(15,2) DEFAULT 0;

-- Add customer_is_member to transaction_temporary
ALTER TABLE transaction_temporary
ADD COLUMN IF NOT EXISTS customer_is_member BOOLEAN DEFAULT FALSE;

-- Create indexes for reporting
CREATE INDEX IF NOT EXISTS idx_transactions_member_savings
ON transactions(total_member_savings) WHERE total_member_savings > 0;

CREATE INDEX IF NOT EXISTS idx_transactions_customer_member
ON transactions(customer_is_member);

-- Comments
COMMENT ON COLUMN transactions.total_member_savings IS 'Total amount saved from all items with member pricing in this transaction';
COMMENT ON COLUMN transactions.customer_is_member IS 'Denormalized flag: whether customer was a member at transaction time';
COMMENT ON COLUMN transaction_temporary.total_member_savings IS 'Total amount saved from member pricing in held order';
COMMENT ON COLUMN transaction_temporary.customer_is_member IS 'Whether customer is member for held order';


-- ============================================================
-- PART 3: Add payment_method_id FK (replace VARCHAR payment_method)
-- ============================================================

-- Add payment_method_id to transactions
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL;

-- Add payment_method_id to transaction_temporary
ALTER TABLE transaction_temporary
ADD COLUMN IF NOT EXISTS payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_transactions_payment_method
ON transactions(payment_method_id);

CREATE INDEX IF NOT EXISTS idx_transaction_temporary_payment_method
ON transaction_temporary(payment_method_id);

-- Comments
COMMENT ON COLUMN transactions.payment_method_id IS 'Reference to payment_methods table (replaces VARCHAR payment_method)';
COMMENT ON COLUMN transaction_temporary.payment_method_id IS 'Reference to payment_methods table for held orders';

-- Note: Keep old payment_method VARCHAR column for backward compatibility
-- It will be deprecated and can be removed in future migration after data migration


-- ============================================================
-- PART 4: Add promo tracking to transactions
-- ============================================================

-- Add promo_id to transactions
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS promo_id UUID REFERENCES promos(id) ON DELETE SET NULL;

-- Add promo details (denormalized for historical record)
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS promo_name VARCHAR(200),
ADD COLUMN IF NOT EXISTS promo_discount_type VARCHAR(20) CHECK (promo_discount_type IN ('amount', 'percentage', NULL)),
ADD COLUMN IF NOT EXISTS promo_discount_value DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS promo_amount DECIMAL(15,2) DEFAULT 0;

-- Add same fields to transaction_temporary
ALTER TABLE transaction_temporary
ADD COLUMN IF NOT EXISTS promo_id UUID REFERENCES promos(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS promo_name VARCHAR(200),
ADD COLUMN IF NOT EXISTS promo_discount_type VARCHAR(20) CHECK (promo_discount_type IN ('amount', 'percentage', NULL)),
ADD COLUMN IF NOT EXISTS promo_discount_value DECIMAL(15,2),
ADD COLUMN IF NOT EXISTS promo_amount DECIMAL(15,2) DEFAULT 0;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_transactions_promo
ON transactions(promo_id);

CREATE INDEX IF NOT EXISTS idx_transactions_promo_amount
ON transactions(promo_amount) WHERE promo_amount > 0;

CREATE INDEX IF NOT EXISTS idx_transaction_temporary_promo
ON transaction_temporary(promo_id);

-- Comments
COMMENT ON COLUMN transactions.promo_id IS 'Reference to promo that was applied (NULL if no promo)';
COMMENT ON COLUMN transactions.promo_name IS 'Promo name at transaction time (denormalized for historical record)';
COMMENT ON COLUMN transactions.promo_discount_type IS 'Type of promo discount: amount or percentage';
COMMENT ON COLUMN transactions.promo_discount_value IS 'Promo discount value (e.g., 10000 for amount, 10 for percentage)';
COMMENT ON COLUMN transactions.promo_amount IS 'Actual discount amount applied from promo';

COMMENT ON COLUMN transaction_temporary.promo_id IS 'Reference to promo for held order';
COMMENT ON COLUMN transaction_temporary.promo_name IS 'Promo name for held order';
COMMENT ON COLUMN transaction_temporary.promo_discount_type IS 'Promo discount type for held order';
COMMENT ON COLUMN transaction_temporary.promo_discount_value IS 'Promo discount value for held order';
COMMENT ON COLUMN transaction_temporary.promo_amount IS 'Promo discount amount for held order';


-- ============================================================
-- PART 5: Update discount_global to clarify it's for manual discounts
-- ============================================================

-- Add comments to clarify discount_global vs promo_amount
COMMENT ON COLUMN transactions.discount_global IS 'Manual global discount (separate from promo_amount)';
COMMENT ON COLUMN transactions.discount_items IS 'Total of manual item-level discounts';
COMMENT ON COLUMN transaction_temporary.discount_global IS 'Manual global discount for held order';
COMMENT ON COLUMN transaction_temporary.discount_items IS 'Total item discounts for held order';


-- ============================================================
-- PART 6: Helper function to calculate total savings
-- ============================================================

-- Create function to calculate comprehensive savings report
CREATE OR REPLACE FUNCTION get_transaction_savings_summary(transaction_uuid UUID)
RETURNS TABLE(
  member_savings DECIMAL(15,2),
  promo_savings DECIMAL(15,2),
  manual_discount DECIMAL(15,2),
  total_savings DECIMAL(15,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(t.total_member_savings, 0) as member_savings,
    COALESCE(t.promo_amount, 0) as promo_savings,
    COALESCE(t.discount_items, 0) + COALESCE(t.discount_global, 0) as manual_discount,
    COALESCE(t.total_member_savings, 0) + COALESCE(t.promo_amount, 0) +
    COALESCE(t.discount_items, 0) + COALESCE(t.discount_global, 0) as total_savings
  FROM transactions t
  WHERE t.id = transaction_uuid;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_transaction_savings_summary IS 'Calculate comprehensive savings breakdown for a transaction';
