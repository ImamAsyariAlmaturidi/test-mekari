import { db } from "../db.js";

type Metering = {
  tenantId: string; model: string; provider: string; primaryModel: string; fallbackUsed: boolean; fallbackReason: string | null;
  inputTokens: number; outputTokens: number; latencyMs: number; costUsd: number; outcome: string;
  intent?: string | null; confidence?: number | null; retrievedEntries?: unknown; errorMessage?: string | null;
  refusalReason?: string | null; retrievalConfidence?: number | null; routingDecision?: string;
  routingStrategy?: string; routingReason?: string; selectedBackend?: string; finalBackend?: string;
  rewrittenQuery?: string | null; queryRewriteUsed?: boolean; evidenceAssessment?: unknown;
  usageEstimated: boolean; costEstimated: boolean;
};

export async function recordRequest(data: Metering) {
  const result = await db.query(
    `INSERT INTO request_logs (tenant_id, model, provider, primary_model, fallback_used, fallback_reason, input_tokens, output_tokens, latency_ms, cost_usd, outcome, intent, confidence, retrieved_entries, error_message, usage_estimated, cost_estimated, refusal_reason, retrieval_confidence, routing_decision, routing_strategy, routing_reason, selected_backend, final_backend, rewritten_query, query_rewrite_used, evidence_assessment)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27::jsonb) RETURNING id, created_at`,
    [data.tenantId, data.model, data.provider, data.primaryModel, data.fallbackUsed, data.fallbackReason, data.inputTokens, data.outputTokens, data.latencyMs, data.costUsd, data.outcome, data.intent ?? null, data.confidence ?? null, data.retrievedEntries == null ? null : JSON.stringify(data.retrievedEntries), data.errorMessage ?? null, data.usageEstimated, data.costEstimated, data.refusalReason ?? null, data.retrievalConfidence ?? null, data.routingDecision ?? "not_routed", data.routingStrategy ?? "balanced", data.routingReason ?? "not recorded", data.selectedBackend ?? data.primaryModel, data.finalBackend ?? data.provider, data.rewrittenQuery ?? null, data.queryRewriteUsed ?? false, data.evidenceAssessment == null ? null : JSON.stringify(data.evidenceAssessment)]
  );
  return result.rows[0] as { id: string; created_at: string };
}
