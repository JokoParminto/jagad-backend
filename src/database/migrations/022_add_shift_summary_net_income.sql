-- Migration 022: Add net_income to shift_summaries
-- Description: Store net income (pemasukan bersih) for reports
-- Date: 2026-02-13

ALTER TABLE shift_summaries
  ADD COLUMN IF NOT EXISTS net_income NUMERIC(15,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN shift_summaries.net_income IS 'Net income (total_pos_sales - modal_awal)';
