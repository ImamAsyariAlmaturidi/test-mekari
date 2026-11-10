CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  api_key_hash text UNIQUE NOT NULL,
  quota_limit integer NOT NULL CHECK (quota_limit >= 0),
  quota_used integer NOT NULL DEFAULT 0 CHECK (quota_used >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL UNIQUE,
  answer text NOT NULL,
  intent text NOT NULL,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  model text NOT NULL,
  primary_model text NOT NULL,
  fallback_used boolean NOT NULL DEFAULT false,
  fallback_reason text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL,
  cost_usd numeric(12, 8) NOT NULL DEFAULT 0,
  outcome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS request_logs_tenant_created_at_idx ON request_logs (tenant_id, created_at DESC);
