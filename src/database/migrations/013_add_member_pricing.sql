-- Migration 013: Add Member Pricing Feature
-- Description: Add is_member field to customers and member_price to products

-- Step 1: Add is_member column to customers table
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS is_member BOOLEAN DEFAULT FALSE;

-- Create index for member customers (for faster queries)
CREATE INDEX IF NOT EXISTS idx_customers_is_member ON customers(is_member);

-- Step 2: Add member_price column to products table
ALTER TABLE products
ADD COLUMN IF NOT EXISTS member_price DECIMAL(15,2) DEFAULT NULL;

-- Create index for products with member pricing
CREATE INDEX IF NOT EXISTS idx_products_member_price ON products(member_price)
WHERE member_price IS NOT NULL;

-- Step 3: Add validation constraint - member_price must be <= price
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_member_price_lte_price'
  ) THEN
    ALTER TABLE products
    ADD CONSTRAINT check_member_price_lte_price
    CHECK (member_price IS NULL OR member_price <= price);
  END IF;
END $$;

-- Step 4: Add validation constraint - member_price must be >= hpp (don't sell below cost)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_member_price_gte_hpp'
  ) THEN
    ALTER TABLE products
    ADD CONSTRAINT check_member_price_gte_hpp
    CHECK (member_price IS NULL OR member_price >= hpp);
  END IF;
END $$;

-- Step 5: Update transaction_items to track if member pricing was applied
ALTER TABLE transaction_items
ADD COLUMN IF NOT EXISTS is_member_price BOOLEAN DEFAULT FALSE;

-- Step 6: Update transaction_item_temporary to track if member pricing was applied (for held orders)
ALTER TABLE transaction_item_temporary
ADD COLUMN IF NOT EXISTS is_member_price BOOLEAN DEFAULT FALSE;

-- Comments for documentation
COMMENT ON COLUMN customers.is_member IS 'Whether customer is a member (eligible for member pricing)';
COMMENT ON COLUMN products.member_price IS 'Special price for member customers (optional, NULL if no member pricing)';
COMMENT ON COLUMN transaction_items.is_member_price IS 'Whether member pricing was applied to this item';
COMMENT ON COLUMN transaction_item_temporary.is_member_price IS 'Whether member pricing was applied to this held order item';
