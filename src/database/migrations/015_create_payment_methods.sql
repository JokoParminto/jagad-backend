-- Migration 015: Create Payment Methods Table
-- Description: Create table for payment methods management (Cash, QRIS, Split Bill)

-- Create Payment Methods Table
CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  icon VARCHAR(10) NOT NULL,
  name VARCHAR(50) NOT NULL UNIQUE,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for payment_methods
CREATE INDEX IF NOT EXISTS idx_payment_methods_status ON payment_methods(status);
CREATE INDEX IF NOT EXISTS idx_payment_methods_name ON payment_methods(name);

-- Create trigger for updated_at on payment_methods
CREATE OR REPLACE FUNCTION update_payment_methods_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_payment_methods_updated_at ON payment_methods;
CREATE TRIGGER trigger_payment_methods_updated_at BEFORE UPDATE ON payment_methods
FOR EACH ROW
EXECUTE FUNCTION update_payment_methods_updated_at();

-- Insert default payment methods
INSERT INTO payment_methods (icon, name, status) VALUES
  ('💵', 'Cash', 'active'),
  ('📱', 'QRIS', 'active'),
  ('🔀', 'Split Bill', 'active')
ON CONFLICT (name) DO NOTHING;
