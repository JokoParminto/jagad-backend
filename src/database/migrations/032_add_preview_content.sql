-- Migration 032: Add preview_content JSONB to printer_masterdata_template and printer_templates
-- Purpose: Store preview data (sample data) for rendering live previews in frontend

-- Add preview_content to printer_masterdata_template
ALTER TABLE printer_masterdata_template 
ADD COLUMN IF NOT EXISTS preview_content JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Add preview_content to printer_templates
ALTER TABLE printer_templates 
ADD COLUMN IF NOT EXISTS preview_content JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Update printer_masterdata_template with preview content for receipt
UPDATE printer_masterdata_template 
SET preview_content = '{
  "sections": {
    "header": [
      {
        "show_logo": true,
        "logo": "logoblack.webp"
      },
      {
        "show_store_name": true,
        "store_name": "Sederek Kopi"
      },
      {
        "show_store_address": true,
        "store_address": "Jl. Jemb. Gantung, Ngrancah, Sriharjo, Kec. Imogiri, Kabupaten Bantul"
      },
      {
        "show_date_time": true,
        "date_time": "17 Feb 2026 14:30"
      },
      {
        "show_cashier": true,
        "cashier": "Bisma"
      },
      {
        "show_customer_name": true,
        "customer_name": "Andi"
      },
      {
        "show_table_number": true,
        "table_number": "18"
      }
    ],
    "items": {
      "item_name": "Americano",
      "show_quantity": true,
      "quantity": 1,
      "show_item_discount": true,
      "item_discount": "1.000",
      "price": "13.000",
      "show_add_ons": true,
      "add_ons": [
        {
          "name": "extra espresso",
          "quantity": 1,
          "price": "3.000"
        },
        {
          "name": "Less Sweet",
          "quantity": 1,
          "price": "0"
        }
      ],
      "subtotal": "15.000"
    },
    "payment": {
      "show_subtotal": true,
      "subtotal": "15.000",
      "show_global_discount": false,
      "global_discount": "0",
      "show_grand_total": true,
      "grand_total": "15.000",
      "show_payment_method": true,
      "payment_method": "QRIS"
    },
    "footer": {
      "footer_text": "Terima kasih atas kunjungannya! Sampai jumpa dan selamat ngopi ~  \"Ngopi bersama kodok dan jangkrik\"",
      "show_qr_code": true
    }
  }
}'::jsonb
WHERE printer_type = 'receipt';

-- Update printer_masterdata_template with preview content for barista
UPDATE printer_masterdata_template 
SET preview_content = '{
  "sections": {
    "header": [
      {
        "show_queue_number": true,
        "queue_number": "01"
      },
      {
        "show_table_number": true,
        "table_number": 10
      },
      {
        "show_date_time": true,
        "date_time": "17 Feb 2026 14:30"
      },
      {
        "show_customer_name": true,
        "customer_name": "Andi"
      }
    ],
    "items": {
      "item_name": "Americano",
      "show_quantity": true,
      "quantity": 1,
      "show_add_ons": true,
      "add_ons": [
        {
          "name": "extra espresso",
          "quantity": 1
        },
        {
          "name": "Less Sweet",
          "quantity": 1
        }
      ]
    },
    "footer": {
      "show_preparation_reminder": true,
      "preparation_text": "Siapkan dengan standar resep ☕"
    }
  }
}'::jsonb
WHERE printer_type = 'barista';
