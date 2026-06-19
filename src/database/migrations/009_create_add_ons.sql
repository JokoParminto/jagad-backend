-- Create add_ons table
CREATE TABLE IF NOT EXISTS add_ons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  price DECIMAL(15,2) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  sort_order INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for status and sorting
CREATE INDEX IF NOT EXISTS idx_add_ons_status ON add_ons(status);
CREATE INDEX IF NOT EXISTS idx_add_ons_sort ON add_ons(sort_order);

-- Insert default add-ons (optional sample data)
INSERT INTO add_ons (name, price, description, sort_order) VALUES
  ('Extra Shot Espresso', 7000, 'Tambahan 1 shot espresso', 1)
ON CONFLICT DO NOTHING;
