-- Migration 023: Create Printers Table
-- Purpose: Store printer configurations and settings

CREATE TABLE IF NOT EXISTS printers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  printer_type VARCHAR(50) NOT NULL CHECK (printer_type IN ('receipt', 'label', 'a4', 'network')),
  
  -- Connection Details
  connection_type VARCHAR(50) NOT NULL CHECK (connection_type IN ('usb', 'network', 'bluetooth')),
  ip_address VARCHAR(15),
  port_number INTEGER,
  device_path VARCHAR(255),
  
  -- Configuration
  paper_width DECIMAL(5,2),
  paper_height DECIMAL(5,2),
  dpi INTEGER DEFAULT 203,
  font_size INTEGER DEFAULT 12,
  
  -- Status & Settings
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'offline')),
  is_default BOOLEAN DEFAULT false,
  auto_print BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_printers_status ON printers(status);
CREATE INDEX IF NOT EXISTS idx_printers_type ON printers(printer_type);
CREATE INDEX IF NOT EXISTS idx_printers_is_default ON printers(is_default);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_printers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_printers_updated_at ON printers;
CREATE TRIGGER trigger_printers_updated_at BEFORE UPDATE ON printers
FOR EACH ROW
EXECUTE FUNCTION update_printers_updated_at();

-- Add audit log
CREATE TABLE IF NOT EXISTS printer_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  printer_id UUID NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  changes JSONB,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_printer_audit_logs_printer ON printer_audit_logs(printer_id);
CREATE INDEX IF NOT EXISTS idx_printer_audit_logs_created_at ON printer_audit_logs(created_at);
