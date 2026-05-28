-- Migration 026: Create Printer Jobs Table
-- Purpose: Track print job history and status

CREATE TABLE IF NOT EXISTS printer_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  printer_id UUID NOT NULL REFERENCES printers(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  template_id UUID REFERENCES printer_templates(id) ON DELETE SET NULL,
  
  job_type VARCHAR(50) NOT NULL CHECK (job_type IN ('receipt', 'barista', 'report', 'test')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'printing', 'completed', 'failed', 'cancelled')),
  
  content JSONB NOT NULL,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_printer_jobs_printer ON printer_jobs(printer_id);
CREATE INDEX IF NOT EXISTS idx_printer_jobs_transaction ON printer_jobs(transaction_id);
CREATE INDEX IF NOT EXISTS idx_printer_jobs_status ON printer_jobs(status);
CREATE INDEX IF NOT EXISTS idx_printer_jobs_created_at ON printer_jobs(created_at DESC);

-- Add view for recent print jobs
CREATE OR REPLACE VIEW recent_print_jobs AS
SELECT 
  pj.id,
  pj.printer_id,
  p.name as printer_name,
  pj.transaction_id,
  pj.job_type,
  pj.status,
  pj.created_at,
  pj.completed_at,
  EXTRACT(EPOCH FROM (pj.completed_at - pj.created_at)) as duration_seconds
FROM printer_jobs pj
LEFT JOIN printers p ON pj.printer_id = p.id
ORDER BY pj.created_at DESC;
