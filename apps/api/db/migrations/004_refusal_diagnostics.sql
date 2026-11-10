ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS refusal_reason text;
ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS retrieval_confidence real;
ALTER TABLE request_logs ADD COLUMN IF NOT EXISTS routing_decision text NOT NULL DEFAULT 'not_routed';
