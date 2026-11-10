import { embedMany, retrieve, type RetrievedEntry } from "./retrieval.js";
import { route, selectBackends, type Backend, type RoutingResult, type RoutingStrategy } from "./router.js";
import type { ChatRequest, ModelOutput } from "./chat.js";
import type { ProviderStream } from "../providers/types.js";
import { assessEvidence, rewriteQuery } from "./query-understanding.js";

export const REFUSAL_TEMPLATE = "I'm sorry, but I don't have enough information to answer that reliably. Please contact support.";
export const GREETING_TEMPLATE = "Hello! How can I help you?";
export type RefusalReason = "no_usable_evidence" | "evidence_check_failed" | "insufficient_information" | null;
type QueryUsage = { inputTokens: number; outputTokens: number; costUsd: number; estimated: boolean };
type EvidenceResult = QueryUsage & { sufficient: boolean; sourceIndexes: number[]; reason: string };
export type SupportResult = RoutingResult & {
  entries: RetrievedEntry[]; retrievalConfidence: number; retrievalMethod: "vector" | "lexical" | "none";
  refusalReason: RefusalReason; routingDecision: string; rewrittenQuery: string; queryRewriteUsed: boolean;
  evidenceAssessment: { sufficient: boolean; sourceIndexes: number[]; reason: string } | null;
};

type Dependencies = {
  embedMany: typeof embedMany; retrieve: typeof retrieve; route: typeof route;
  rewrite: typeof rewriteQuery; assess: typeof assessEvidence;
};
const defaults: Dependencies = { embedMany, retrieve, route, rewrite: rewriteQuery, assess: assessEvidence };
const isGreeting = /^(hai|halo|hi|hello|hey)( kak)?[!. ]*$/i;
const emptyUsage: QueryUsage = { inputTokens: 0, outputTokens: 0, costUsd: 0, estimated: false };
const addUsage = (a: QueryUsage, b: QueryUsage): QueryUsage => ({ inputTokens: a.inputTokens + b.inputTokens, outputTokens: a.outputTokens + b.outputTokens, costUsd: a.costUsd + b.costUsd, estimated: a.estimated || b.estimated });

function baseResult(strategy: RoutingStrategy, selected: ReturnType<typeof selectBackends>, output: ModelOutput, reason: RefusalReason, decision: string, entries: RetrievedEntry[] = [], query = "", usage = emptyUsage, assessment: SupportResult["evidenceAssessment"] = null): SupportResult {
  return { output, entries, retrievalConfidence: entries[0]?.score ?? 0,
    retrievalMethod: entries[0]?.retrievalMethod ?? "none", refusalReason: reason, routingDecision: decision,
    rewrittenQuery: query, queryRewriteUsed: false, evidenceAssessment: assessment,
    routingStrategy: strategy, routingReason: selected.reason, selectedBackend: selected.primary, finalBackend: "not_run",
    model: reason ? "pre-generation-refusal" : "not_run", provider: "openrouter-query", primaryModel: selected.primary,
    fallbackUsed: false, fallbackReason: null, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
    costUsd: usage.costUsd, usageEstimated: usage.estimated, costEstimated: usage.estimated };
}

export async function answerSupport(request: ChatRequest, history: { role: "user" | "assistant"; content: string }[], stream?: ProviderStream, dependencies: Dependencies = defaults, options: { rewriteQuery?: boolean; routeBackend?: Exclude<Backend, "mock"> } = {}): Promise<SupportResult> {
  const selected = options.routeBackend
    ? { primary: options.routeBackend, fallback: options.routeBackend, reason: String(options.routeBackend) + " selected for evaluation" }
    : selectBackends(request.routingStrategy);
  if (isGreeting.test(request.message)) {
    const result = baseResult(request.routingStrategy, selected, { answer: GREETING_TEMPLATE, intent: "greeting", confidence: 1 }, null, "greeting_handled_without_generation");
    stream?.onDelta(GREETING_TEMPLATE);
    return result;
  }

  let rewritten = request.message;
  let usage = emptyUsage;
  if (options.rewriteQuery) {
    try { const result = await dependencies.rewrite(request.message); rewritten = result.query; usage = addUsage(usage, result); } catch { /* original query remains the search fallback */ }
  }
  let vectors: number[][] = [];
  try { vectors = await dependencies.embedMany([...new Set([request.message, rewritten])]); } catch { /* lexical retrieval remains available */ }
  const queries = [...new Set([request.message, rewritten])];
  const candidates = await Promise.all(queries.map((query, index) => dependencies.retrieve(query, vectors[index])));
  const byId = new Map<string, RetrievedEntry>();
  for (const entry of candidates.flat()) {
    const current = byId.get(entry.id);
    if (!current || entry.score > current.score) byId.set(entry.id, entry);
  }
  const entries = [...byId.values()].sort((a, b) => b.score - a.score).slice(0, 6);
  if (!entries.length) {
    const result = baseResult(request.routingStrategy, selected, { answer: REFUSAL_TEMPLATE, intent: "unknown", confidence: 0 }, "no_usable_evidence", "refused_no_retrieval_candidates", entries, rewritten, usage);
    stream?.onDelta(REFUSAL_TEMPLATE);
    return result;
  }

  let evidence: EvidenceResult;
  try {
    evidence = await dependencies.assess(request.message, entries);
    usage = addUsage(usage, evidence);
  } catch {
    const result = baseResult(request.routingStrategy, selected, { answer: REFUSAL_TEMPLATE, intent: entries[0]?.intent ?? "unknown", confidence: 0 }, "evidence_check_failed", "refused_evidence_check_failed", entries, rewritten, usage,
      { sufficient: false, sourceIndexes: [], reason: "Evidence assessment was unavailable or malformed." });
    stream?.onDelta(REFUSAL_TEMPLATE);
    return result;
  }
  const assessment = { sufficient: evidence.sufficient, sourceIndexes: evidence.sourceIndexes, reason: evidence.reason };
  if (!evidence.sufficient) {
    const result = baseResult(request.routingStrategy, selected, { answer: REFUSAL_TEMPLATE, intent: entries[0]?.intent ?? "unknown", confidence: 0 }, "no_usable_evidence", "refused_insufficient_evidence", entries, rewritten, usage, assessment);
    stream?.onDelta(REFUSAL_TEMPLATE);
    return result;
  }

  const usableEntries = evidence.sourceIndexes.map((index) => entries[index]);
  let routed: RoutingResult;
  try {
    routed = await dependencies.route({ message: rewritten, history, entries: usableEntries, concise: request.configuration === "concise" }, stream, request.routingStrategy,
      options.routeBackend ? { selection: selected, disableFallback: true } : undefined);
  } catch (error) {
    if (error && typeof error === "object") Object.assign(error, { supportMetadata: { entries, retrievalConfidence: entries[0]?.score ?? 0, retrievalMethod: entries[0]?.retrievalMethod ?? "none", rewrittenQuery: rewritten, queryRewriteUsed: options.rewriteQuery === true && rewritten !== request.message, evidenceAssessment: assessment }, queryUsage: usage });
    throw error;
  }
  const resultUsage = addUsage(usage, { inputTokens: routed.inputTokens, outputTokens: routed.outputTokens, costUsd: routed.costUsd, estimated: routed.usageEstimated || routed.costEstimated });
  const refusalReason = routed.output.refusalReason === "insufficient_information" ? "insufficient_information" : null;
  return { ...routed, entries, retrievalConfidence: entries[0]?.score ?? 0, retrievalMethod: entries[0]?.retrievalMethod ?? "none",
    refusalReason, routingDecision: routed.fallbackUsed ? "fallback_served" : "primary_served", rewrittenQuery: rewritten,
    queryRewriteUsed: options.rewriteQuery === true && rewritten !== request.message, evidenceAssessment: assessment,
    inputTokens: resultUsage.inputTokens, outputTokens: resultUsage.outputTokens, costUsd: resultUsage.costUsd,
    usageEstimated: resultUsage.estimated, costEstimated: resultUsage.estimated };
}
