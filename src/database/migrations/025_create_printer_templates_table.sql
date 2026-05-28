-- Migration 025: Create Printer Templates Table
-- Purpose: Store receipt and barista ticket templates

CREATE TABLE IF NOT EXISTS printer_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  template_type VARCHAR(50) NOT NULL CHECK (template_type IN ('receipt', 'barista', 'report', 'custom')),
  content JSONB NOT NULL,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(name, template_type)
);

CREATE INDEX IF NOT EXISTS idx_printer_templates_type ON printer_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_printer_templates_active ON printer_templates(is_active);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_printer_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_printer_templates_updated_at ON printer_templates;
CREATE TRIGGER trigger_printer_templates_updated_at BEFORE UPDATE ON printer_templates
FOR EACH ROW
EXECUTE FUNCTION update_printer_templates_updated_at();

-- Note: Default templates are now seeded from printer_masterdata_template
-- with preview_content in migration 032, so we don't insert them here anymore
