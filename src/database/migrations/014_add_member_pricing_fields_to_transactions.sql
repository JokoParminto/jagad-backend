-- Migration 014: Add Member Pricing Fields to Transaction Items
-- Description: Add original_price and member_price to transaction_items and transaction_item_temporary

-- Step 1: Add original_price column to transaction_items
ALTER TABLE transaction_items
ADD COLUMN IF NOT EXISTS original_price DECIMAL(15,2) DEFAULT NULL;

-- Step 2: Add member_price column to transaction_items
ALTER TABLE transaction_items
ADD COLUMN IF NOT EXISTS member_price DECIMAL(15,2) DEFAULT NULL;

-- Step 3: Add original_price column to transaction_item_temporary
ALTER TABLE transaction_item_temporary
ADD COLUMN IF NOT EXISTS original_price DECIMAL(15,2) DEFAULT NULL;

-- Step 4: Add member_price column to transaction_item_temporary
ALTER TABLE transaction_item_temporary
ADD COLUMN IF NOT EXISTS member_price DECIMAL(15,2) DEFAULT NULL;

-- Comments for documentation
COMMENT ON COLUMN transaction_items.original_price IS 'Original product price (before member pricing)';
COMMENT ON COLUMN transaction_items.member_price IS 'Member price that was available for this item';
COMMENT ON COLUMN transaction_item_temporary.original_price IS 'Original product price (before member pricing) for held orders';
COMMENT ON COLUMN transaction_item_temporary.member_price IS 'Member price that was available for held order items';
