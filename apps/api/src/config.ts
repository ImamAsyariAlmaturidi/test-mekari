import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: new URL(import.meta.url.includes("/dist/") ? "../../../../.env" : "../../../.env", import.meta.url) });

const providerName = z.enum(["openai", "openrouter", "openrouter_fallback", "mock"]);

const schema = z.object({
  DATABASE_URL: z.string().url(),
  OPENAI_API_KEY: z.string().optional(),
  API_KEY_HASH_SECRET: z.string().min(16),
  TENANT_ADMIN_KEY: z.string().min(24).optional().or(z.literal("")),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  MODEL_INPUT_COST_PER_MILLION: z.coerce.number().nonnegative().default(0.15),
  MODEL_OUTPUT_COST_PER_MILLION: z.coerce.number().nonnegative().default(0.6),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().optional(),
  OPENROUTER_FALLBACK_MODEL: z.string().optional(),
  OPENROUTER_EMBEDDING_MODEL: z.string().default("openai/text-embedding-3-small"),
  OPENROUTER_APP_URL: z.string().url().default("http://localhost:3000"),
  OPENROUTER_INPUT_COST_PER_MILLION: z.coerce.number().nonnegative().default(0),
  OPENROUTER_OUTPUT_COST_PER_MILLION: z.coerce.number().nonnegative().default(0),
  OPENROUTER_FALLBACK_INPUT_COST_PER_MILLION: z.coerce.number().nonnegative().default(2),
  OPENROUTER_FALLBACK_OUTPUT_COST_PER_MILLION: z.coerce.number().nonnegative().default(12),
  OPENROUTER_QUERY_MODEL: z.string().default("openai/gpt-4.1-nano"),
  OPENROUTER_QUERY_INPUT_COST_PER_MILLION: z.coerce.number().nonnegative().default(0.1),
  OPENROUTER_QUERY_OUTPUT_COST_PER_MILLION: z.coerce.number().nonnegative().default(0.4),
  PRIMARY_PROVIDER: providerName.default("openrouter"),
  FALLBACK_PROVIDER: providerName.default("mock"),
  MOCK_LATENCY_MS: z.coerce.number().int().nonnegative().default(400),
  MOCK_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0),
  PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000")
});

export const env = schema.parse(process.env);

export function isAllowedOrigin(origin: string | undefined) {
  return !origin || origin === env.WEB_ORIGIN || (
    process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
  );
}
