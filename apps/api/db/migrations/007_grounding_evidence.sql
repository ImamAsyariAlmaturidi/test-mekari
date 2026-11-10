ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS grounding_evidence jsonb;
