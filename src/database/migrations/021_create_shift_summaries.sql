-- Migration 021: Create shift_summaries table
-- Description: Persist shift closing summary for reports
-- Date: 2026-02-13

CREATE TABLE IF NOT EXISTS shift_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  modal_awal NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_sales_income NUMERIC(15,2) NOT NULL DEFAULT 0,
  cash_income NUMERIC(15,2) NOT NULL DEFAULT 0,
  qris_income NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_expenses NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_pos_sales NUMERIC(15,2) NOT NULL DEFAULT 0,
  shopee_food_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  shopee_food_discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  shopee_food_discount_nominal NUMERIC(15,2) NOT NULL DEFAULT 0,
  shopee_food_net NUMERIC(15,2) NOT NULL DEFAULT 0,
  actual_cash NUMERIC(15,2),
  expected_cash NUMERIC(15,2),
  selisih NUMERIC(15,2),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shift_summaries_shift_id ON shift_summaries(shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_summaries_created_at ON shift_summaries(created_at);

CREATE OR REPLACE FUNCTION update_shift_summaries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_shift_summaries_updated_at ON shift_summaries;
CREATE TRIGGER trigger_shift_summaries_updated_at
BEFORE UPDATE ON shift_summaries
FOR EACH ROW EXECUTE FUNCTION update_shift_summaries_updated_at();
