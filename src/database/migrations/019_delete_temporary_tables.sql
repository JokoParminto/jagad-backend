-- Migration 019: Delete Temporary Tables
-- Description: Remove temporary transaction tables
-- Date: 2026-02-13

DROP TABLE IF EXISTS transaction_temporary_item_add_ons CASCADE;
DROP TABLE IF EXISTS transaction_item_temporary CASCADE;
DROP TABLE IF EXISTS transaction_temporary CASCADE;

-- Verify tables are deleted
DO $$
DECLARE
  remaining_count INT;
BEGIN
  SELECT COUNT(*) INTO remaining_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN ('transaction_temporary', 'transaction_item_temporary', 'transaction_temporary_item_add_ons');
  
  IF remaining_count > 0 THEN
    RAISE EXCEPTION 'ERROR: Failed to delete temporary tables. % tables remain', remaining_count;
  ELSE
    RAISE NOTICE 'SUCCESS: All temporary tables deleted';
  END IF;
END $$;
