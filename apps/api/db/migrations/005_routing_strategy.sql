ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS routing_strategy text NOT NULL DEFAULT 'balanced';
ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS routing_reason text NOT NULL DEFAULT 'not recorded';
ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS selected_backend text;
ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS final_backend text;
