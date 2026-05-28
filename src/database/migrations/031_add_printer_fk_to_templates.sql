-- Migration 031: Add Printer FK to Printer Templates Table
-- Purpose: Link each template to a specific printer for per-printer customization
-- Flow: printer_masterdata_template (defaults) -> printer_templates (per-printer customizations)

-- Add id_printer column as nullable first to handle existing data
ALTER TABLE printer_templates 
  ADD COLUMN IF NOT EXISTS id_printer UUID REFERENCES printers(id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_printer_templates_printer_id ON printer_templates(id_printer);

-- Clear existing templates (they are not linked to specific printers)
-- This is safe because we'll recreate them when printers are created/updated
TRUNCATE TABLE printer_templates CASCADE;

-- Now make id_printer NOT NULL since we cleared the table
ALTER TABLE printer_templates 
  ALTER COLUMN id_printer SET NOT NULL;

-- Update the UNIQUE constraint to include id_printer for per-printer templates
-- (Keep name and template_type unique per printer)
ALTER TABLE printer_templates 
  DROP CONSTRAINT IF EXISTS printer_templates_name_template_type_key;
ALTER TABLE printer_templates 
  DROP CONSTRAINT IF EXISTS printer_templates_name_template_type_printer_key;
ALTER TABLE printer_templates 
  ADD CONSTRAINT printer_templates_name_template_type_printer_key 
  UNIQUE(name, template_type, id_printer);
