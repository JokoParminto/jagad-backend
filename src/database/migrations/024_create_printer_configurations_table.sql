-- Migration 024: Create Printer Configurations Table
-- Purpose: Store key-value printer settings

CREATE TABLE IF NOT EXISTS printer_configurations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  printer_id UUID NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
  key VARCHAR(100) NOT NULL,
  value TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(printer_id, key)
);

CREATE INDEX IF NOT EXISTS idx_printer_configurations_printer ON printer_configurations(printer_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_printer_configurations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_printer_configurations_updated_at ON printer_configurations;
CREATE TRIGGER trigger_printer_configurations_updated_at BEFORE UPDATE ON printer_configurations
FOR EACH ROW
EXECUTE FUNCTION update_printer_configurations_updated_at();
