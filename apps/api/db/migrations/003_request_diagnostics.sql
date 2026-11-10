ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS intent text;
ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS confidence real;
ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS retrieved_entries jsonb;
ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS error_message text;
ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS usage_estimated boolean NOT NULL DEFAULT true;
ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS cost_estimated boolean NOT NULL DEFAULT true;
