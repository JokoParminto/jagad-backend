-- Migration 029: Update Printer Type Constraint
-- Purpose: Add 'barista' as valid printer_type (for barista tickets)
-- This migration adds support for barista ticket printers alongside receipt, label, a4, and network types

-- Drop the old constraint
ALTER TABLE printers DROP CONSTRAINT printers_printer_type_check;

-- Add new constraint with 'barista' type included
ALTER TABLE printers 
  ADD CONSTRAINT printers_printer_type_check 
  CHECK (printer_type IN ('receipt', 'barista', 'label', 'a4', 'network'));

-- Note: No data migration needed as this only expands allowed values
