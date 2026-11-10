ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS rewritten_query TEXT;
ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS query_rewrite_used BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS evidence_assessment JSONB;
