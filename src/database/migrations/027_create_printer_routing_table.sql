-- Migration 027: Create Printer Routing Table
-- Purpose: Route different print types to specific printers

CREATE TABLE IF NOT EXISTS printer_routing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  print_type VARCHAR(50) NOT NULL UNIQUE CHECK (print_type IN ('customer_receipt', 'barista_ticket', 'label')),
  printer_id UUID NOT NULL REFERENCES printers(id) ON DELETE CASCADE,
  template_id UUID REFERENCES printer_templates(id) ON DELETE SET NULL,
  
  is_enabled BOOLEAN DEFAULT true,
  auto_print BOOLEAN DEFAULT false,
  print_copies INTEGER DEFAULT 1,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_printer_routing_print_type ON printer_routing(print_type);
CREATE INDEX IF NOT EXISTS idx_printer_routing_printer ON printer_routing(printer_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_printer_routing_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_printer_routing_updated_at ON printer_routing;
CREATE TRIGGER trigger_printer_routing_updated_at BEFORE UPDATE ON printer_routing
FOR EACH ROW
EXECUTE FUNCTION update_printer_routing_updated_at();

-- Insert default routing (will be updated once printers are created)
-- This is a placeholder; actual routes should be configured via API
