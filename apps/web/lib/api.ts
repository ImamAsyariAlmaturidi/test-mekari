export const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export type RetrievedEntry = { id?: string; question: string; answer: string; intent: string; score: number; retrievalMethod?: "vector" | "lexical" };
export type RoutingStrategy = "balanced" | "cost_optimized";
export type RequestMeta = { model: string; provider: string; primaryModel: string; fallbackUsed: boolean; fallbackReason: string | null; entries: RetrievedEntry[]; intent: string; confidence: number; retrievalConfidence: number; retrievalMethod: "vector" | "lexical" | "none"; refusalReason: string | null; routingDecision: string; routingStrategy: RoutingStrategy; routingReason: string; selectedBackend: string; finalBackend: string; rewrittenQuery: string; queryRewriteUsed: boolean; evidenceAssessment: { sufficient: boolean; sourceIndexes: number[]; reason: string } | null };
export type RequestDone = { requestId: string; timestamp: string; outcome: string; refusalReason: string | null; tokens: number; inputTokens: number; outputTokens: number; latencyMs: number; costUsd: number; remainingQuota: number };
export type Analytics = { tenant: string; quotaLimit: number; quotaUsed: number; remainingQuota: number; requests: number; input_tokens: number; output_tokens: number; cost_usd: number; average_latency_ms: number; p95_latency_ms: number; successful_requests: number; refused_requests: number; failed_requests: number; quota_exceeded_requests: number; fallback_requests: number; estimated_usage_requests: number; estimated_cost_requests: number; daily: { date: string; requests: number; cost_usd: number }[]; models: { model: string; requests: number; cost_usd: number }[]; providers: { provider: string; requests: number; cost_usd: number }[]; outcomes: { outcome: string; requests: number }[] };
export type RequestLog = { id: string; created_at: string; tenant: string; model: string; provider: string | null; primary_model: string; fallback_used: boolean; fallback_reason: string | null; input_tokens: number; output_tokens: number; latency_ms: number; cost_usd: number; outcome: string; intent: string | null; confidence: number | null; error_message: string | null; usage_estimated: boolean; cost_estimated: boolean; refusal_reason: string | null; retrieval_confidence: number | null; routing_decision: string; routing_strategy: RoutingStrategy; routing_reason: string; selected_backend: string | null; final_backend: string | null; rewritten_query: string | null; query_rewrite_used: boolean; evidence_assessment: { sufficient: boolean; sourceIndexes: number[]; reason: string } | null };
export type RequestDetail = Omit<RequestLog, "tenant"> & { tenant: string; retrieved_entries: RetrievedEntry[] | null };
export type ChatTurn = { role: "user" | "assistant"; content: string };
export type EvaluationCaseResult = { index: number; question: string; expectedIntent: string; predictedIntent: string; intentCorrect: boolean; retrievalIntentMatch: boolean; refused: boolean; refusalReason: string | null; answer: string; model: string; provider: string; rewrittenQuery: string; queryRewriteUsed: boolean; retrievalConfidence: number; evidenceAssessment: { sufficient: boolean; sourceIndexes: number[]; reason: string } | null; retrievedEntries: RetrievedEntry[]; answerSimilarity: number | null; latencyMs: number; costUsd: number };
export type EvaluationResult = { mode: "direct" | "rewrite"; cases: number; intents: number; intentAccuracy: number; retrievalIntentMatchRate: number; refusalRate: number; answerQuality: number | null; answerQualityMethod: string; averageLatencyMs: number; totalCostUsd: number; caseResults?: EvaluationCaseResult[] };
export type EvaluationJob = { id: string; status: "running" | "completed" | "failed"; mode: "direct" | "rewrite"; completedCases: number; totalCases: number; startedAt: string; finishedAt?: string };
export type EvaluationReport = { available: boolean; source?: string; generatedAt?: string; cases?: number; results?: EvaluationResult[]; job?: EvaluationJob | null };
export type SupportSuggestion = { prompt: string; label: string };

export async function getEvaluation() {
  const response = await fetch(`${apiUrl}/v1/evaluation`, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load evaluation results");
  return response.json() as Promise<EvaluationReport>;
}

export async function startEvaluation(apiKey: string) {
  const response = await fetch(`${apiUrl}/v1/evaluation/run`, { method: "POST", headers: { "x-api-key": apiKey } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `Evaluation could not start (${response.status})`);
  return data as { job: EvaluationJob };
}

export async function getJson<T>(path: string, apiKey: string): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { headers: { "x-api-key": apiKey }, cache: "no-store" });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? `Request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export async function createTenant(name: string, quotaLimit: number, adminKey: string) {
  const response = await fetch(`${apiUrl}/v1/tenants`, { method: "POST", headers: { "content-type": "application/json", "x-tenant-admin-key": adminKey }, body: JSON.stringify({ name, quotaLimit }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
  return data as { tenant: { name: string; quota_limit: number }; apiKey: string };
}

export async function healthCheck() {
  const response = await fetch(`${apiUrl}/health`, { cache: "no-store" });
  if (!response.ok) throw new Error("API unavailable");
  return response.json() as Promise<{ ok: boolean }>;
}

export async function getConversation(id: string, apiKey: string) {
  return getJson<{ messages: ChatTurn[] }>(`/v1/conversations/${id}`, apiKey);
}

export async function streamChat(message: string, apiKey: string, conversationId: string, onEvent: (event: string, data: unknown) => void, signal?: AbortSignal, routingStrategy: RoutingStrategy = "balanced") {
  const response = await fetch(`${apiUrl}/v1/chat`, { method: "POST", headers: { "content-type": "application/json", "x-api-key": apiKey }, body: JSON.stringify({ message, conversationId, routingStrategy }), signal });
  if (!response.ok || !response.body) throw new Error((await response.json().catch(() => ({}))).error ?? "Request failed");
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let terminalEvent = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n"); buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const event = block.match(/^event: (.+)$/m)?.[1]; const payload = block.match(/^data: (.+)$/m)?.[1];
      if (event && payload) {
        if (event === "done" || event === "error") terminalEvent = true;
        onEvent(event, JSON.parse(payload));
      }
    }
  }
  if (!terminalEvent) throw new Error("Inference stream ended before completion. Check the API logs and database migration status.");
}
