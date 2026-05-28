-- Create transaction_item_add_ons table (junction table)
CREATE TABLE IF NOT EXISTS transaction_item_add_ons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_item_id UUID NOT NULL REFERENCES transaction_items(id) ON DELETE CASCADE,
  add_on_id UUID NOT NULL REFERENCES add_ons(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  price DECIMAL(15,2) NOT NULL, -- Snapshot harga saat transaksi
  subtotal DECIMAL(15,2) NOT NULL, -- quantity * price
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_transaction_item_add_ons_item ON transaction_item_add_ons(transaction_item_id);
CREATE INDEX IF NOT EXISTS idx_transaction_item_add_ons_add_on ON transaction_item_add_ons(add_on_id);
CREATE INDEX IF NOT EXISTS idx_transaction_item_add_ons_created ON transaction_item_add_ons(created_at);
