-- Migration 030: Create Printer Masterdata Template Table
-- Purpose: Store default master templates for receipt and barista printers
-- These are used as base templates when creating new printers

CREATE TABLE IF NOT EXISTS printer_masterdata_template (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  printer_type VARCHAR(50) NOT NULL CHECK (printer_type IN ('receipt', 'barista')),
  content JSONB NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(name, printer_type)
);

CREATE INDEX IF NOT EXISTS idx_printer_masterdata_template_type ON printer_masterdata_template(printer_type);
CREATE INDEX IF NOT EXISTS idx_printer_masterdata_template_active ON printer_masterdata_template(is_active);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_printer_masterdata_template_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_printer_masterdata_template_updated_at ON printer_masterdata_template;
CREATE TRIGGER trigger_printer_masterdata_template_updated_at BEFORE UPDATE ON printer_masterdata_template
FOR EACH ROW
EXECUTE FUNCTION update_printer_masterdata_template_updated_at();

-- Insert default masterdata templates with complete JSONB structure
INSERT INTO printer_masterdata_template (name, printer_type, description, content, is_active)
VALUES 
  (
    'Default Receipt Template',
    'receipt',
    'Master template for customer receipts (80mm) - Complete with all sections',
    '{
      "sections": {
        "header": {
          "show_logo": true,
          "show_store_name": true,
          "show_store_address": true,
          "show_store_phone": true,
          "show_transaction_id": true,
          "show_date_time": true,
          "show_cashier": true,
          "show_customer_name": true,
          "show_table_number": true,
          "show_store_info": true
        },
        "items": {
          "show_item_name": true,
          "show_quantity": true,
          "show_add_ons": true,
          "show_item_discount": true,
          "show_item_subtotal": true,
          "show_notes": false
        },
        "payment": {
          "show_subtotal": true,
          "show_global_discount": true,
          "show_discount_reason": false,
          "show_tax": true,
          "show_tax_breakdown": false,
          "show_service_charge": true,
          "show_rounding": true,
          "show_grand_total": true,
          "show_payment_method": true,
          "show_payment_reference": true
        },
        "footer": {
          "footer_text": "Terima kasih sudah berbelanja ☕",
          "show_qr_code": true
        }
      }
    }'::jsonb,
    true
  ),
  (
    'Default Barista Template',
    'barista',
    'Master template for barista tickets (58mm) - Complete with all sections',
    '{
      "sections": {
        "header": {
          "show_queue_number": true,
          "show_time": true,
          "show_customer_name": true,
          "show_table_number": true,
          "show_channel": true
        },
        "items": {
          "show_item_name": true,
          "show_quantity": true,
          "show_add_ons": true,
          "show_notes": true,
          "show_price": false
        },
        "footer": {
          "show_preparation_reminder": true,
          "preparation_text": "Siapkan dengan standar resep ☕"
        }
      }
    }'::jsonb,
    true
  )
ON CONFLICT (name, printer_type) DO NOTHING;
