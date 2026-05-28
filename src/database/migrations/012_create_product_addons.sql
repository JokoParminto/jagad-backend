-- Migration 012: Create Product Add-ons Junction Table
-- Description: Create many-to-many relationship between products and add_ons

-- Create product_addons junction table
CREATE TABLE IF NOT EXISTS product_addons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  addon_id UUID NOT NULL REFERENCES add_ons(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, addon_id)
);

-- Create indexes for foreign keys
CREATE INDEX IF NOT EXISTS idx_product_addons_product_id ON product_addons(product_id);
CREATE INDEX IF NOT EXISTS idx_product_addons_addon_id ON product_addons(addon_id);

-- Create trigger for updated_at on product_addons
CREATE OR REPLACE FUNCTION update_product_addons_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_product_addons_updated_at ON product_addons;
CREATE TRIGGER trigger_product_addons_updated_at BEFORE UPDATE ON product_addons
FOR EACH ROW
EXECUTE FUNCTION update_product_addons_updated_at();
