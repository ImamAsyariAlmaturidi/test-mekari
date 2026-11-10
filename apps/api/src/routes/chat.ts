import type { FastifyInstance } from "fastify";
import { chatRequest } from "../services/chat.js";
import { authenticate } from "../services/auth.js";
import { reserveQuota } from "../services/quota.js";
import { answerSupport } from "../services/support.js";
import { recordRequest } from "../services/metering.js";
import { env, isAllowedOrigin } from "../config.js";
import { ensureConversation, getConversationMessages, saveConversationMessage } from "../services/conversations.js";
import { RoutingFailure } from "../services/router.js";
import { InvalidModelOutputError } from "../providers/types.js";

const sendEvent = (reply: { raw: { write(chunk: string): void } }, event: string, data: unknown) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

export async function chatRoutes(app: FastifyInstance) {
  app.post("/v1/chat", async (request, reply) => {
    const suppliedKey = request.headers["x-api-key"];
    const tenant = await authenticate(Array.isArray(suppliedKey) ? suppliedKey[0] : suppliedKey);
    if (!tenant) return reply.code(401).send({ error: "Invalid or missing x-api-key" });
    const parsed = chatRequest.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid request", details: parsed.error.flatten() });
    if (!await ensureConversation(parsed.data.conversationId, tenant.id)) return reply.code(404).send({ error: "Conversation not found" });
    const started = performance.now();
    const quota = await reserveQuota(tenant.id);
    if (!quota) {
      await recordRequest({ tenantId: tenant.id, model: "none", provider: env.PRIMARY_PROVIDER, primaryModel: env.PRIMARY_PROVIDER, fallbackUsed: false, fallbackReason: null, inputTokens: 0, outputTokens: 0, latencyMs: Math.round(performance.now() - started), costUsd: 0, outcome: "quota_exceeded", errorMessage: "Tenant quota exhausted", usageEstimated: false, costEstimated: false });
      return reply.code(429).send({ error: "Tenant quota exhausted" });
    }
    let history: Awaited<ReturnType<typeof getConversationMessages>>;
    try {
      history = await getConversationMessages(parsed.data.conversationId, tenant.id);
      await saveConversationMessage(parsed.data.conversationId, "user", parsed.data.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      await recordRequest({ tenantId: tenant.id, model: "none", provider: env.PRIMARY_PROVIDER, primaryModel: env.PRIMARY_PROVIDER, fallbackUsed: false, fallbackReason: null, inputTokens: 0, outputTokens: 0, latencyMs: Math.round(performance.now() - started), costUsd: 0, outcome: "error", errorMessage: message, usageEstimated: false, costEstimated: false });
      return reply.code(500).send({ error: message });
    }

    reply.header("content-type", "text/event-stream");
    reply.header("cache-control", "no-cache");
    reply.header("connection", "keep-alive");
    const origin = request.headers.origin;
    if (isAllowedOrigin(origin)) {
      if (origin) reply.raw.setHeader("access-control-allow-origin", origin);
      reply.raw.setHeader("vary", "Origin");
    }
    reply.hijack();
    reply.raw.writeHead(200);
    let result: Awaited<ReturnType<typeof answerSupport>> | null = null;
    try {
      result = await answerSupport(parsed.data, history, {
        onDelta: (text) => sendEvent(reply, "delta", { text }),
        onReset: () => sendEvent(reply, "reset", {})
      });
      await saveConversationMessage(parsed.data.conversationId, "assistant", result.output.answer);
      const latencyMs = Math.round(performance.now() - started);
      const outcome = result.refusalReason ? "refused" : "success";
      const logged = await recordRequest({ tenantId: tenant.id, model: result.model, provider: result.provider, primaryModel: result.primaryModel, fallbackUsed: result.fallbackUsed, fallbackReason: result.fallbackReason, inputTokens: result.inputTokens, outputTokens: result.outputTokens, latencyMs, costUsd: result.costUsd, outcome, intent: result.output.intent, confidence: result.output.confidence, retrievedEntries: result.entries, usageEstimated: result.usageEstimated, costEstimated: result.costEstimated, refusalReason: result.refusalReason, retrievalConfidence: result.retrievalConfidence, routingDecision: result.routingDecision, routingStrategy: result.routingStrategy, routingReason: result.routingReason, selectedBackend: result.selectedBackend, finalBackend: result.finalBackend, rewrittenQuery: result.rewrittenQuery, queryRewriteUsed: result.queryRewriteUsed, evidenceAssessment: result.evidenceAssessment });
      sendEvent(reply, "meta", { model: result.model, provider: result.provider, primaryModel: result.primaryModel, fallbackUsed: result.fallbackUsed, fallbackReason: result.fallbackReason, entries: result.entries, intent: result.output.intent, confidence: result.output.confidence, retrievalConfidence: result.retrievalConfidence, retrievalMethod: result.retrievalMethod, refusalReason: result.refusalReason, routingDecision: result.routingDecision, routingStrategy: result.routingStrategy, routingReason: result.routingReason, selectedBackend: result.selectedBackend, finalBackend: result.finalBackend, rewrittenQuery: result.rewrittenQuery, queryRewriteUsed: result.queryRewriteUsed, evidenceAssessment: result.evidenceAssessment });
      sendEvent(reply, "done", { requestId: logged.id, timestamp: logged.created_at, outcome, refusalReason: result.refusalReason, tokens: result.inputTokens + result.outputTokens, inputTokens: result.inputTokens, outputTokens: result.outputTokens, latencyMs, costUsd: result.costUsd, remainingQuota: quota.quota_limit - quota.quota_used });
    } catch (error) {
      const latencyMs = Math.round(performance.now() - started);
      const message = error instanceof Error ? error.message : "Unexpected error";
      const routingFailure = error instanceof RoutingFailure ? error : null;
      const invalidOutput = error instanceof InvalidModelOutputError ? error : null;
      const failureDetails = error && typeof error === "object" ? error as { queryUsage?: { inputTokens: number; outputTokens: number; costUsd: number; estimated: boolean }; supportMetadata?: { entries: Awaited<ReturnType<typeof answerSupport>>["entries"]; retrievalConfidence: number; retrievalMethod: Awaited<ReturnType<typeof answerSupport>>["retrievalMethod"]; rewrittenQuery: string; queryRewriteUsed: boolean; evidenceAssessment: Awaited<ReturnType<typeof answerSupport>>["evidenceAssessment"] } } : {};
      const queryUsage = failureDetails.queryUsage;
      let logged: Awaited<ReturnType<typeof recordRequest>>;
      try {
        logged = await recordRequest({ tenantId: tenant.id, model: result?.model ?? invalidOutput?.usage.model ?? "none", provider: result?.provider ?? invalidOutput?.provider ?? routingFailure?.fallbackModel ?? env.PRIMARY_PROVIDER, primaryModel: result?.primaryModel ?? invalidOutput?.primaryProvider ?? routingFailure?.primaryModel ?? env.PRIMARY_PROVIDER, fallbackUsed: result?.fallbackUsed ?? invalidOutput?.fallbackUsed ?? Boolean(routingFailure), fallbackReason: result?.fallbackReason ?? invalidOutput?.fallbackReason ?? routingFailure?.primaryFailure ?? null, inputTokens: result?.inputTokens ?? (invalidOutput?.usage.inputTokens ?? 0) + (queryUsage?.inputTokens ?? 0), outputTokens: result?.outputTokens ?? (invalidOutput?.usage.outputTokens ?? 0) + (queryUsage?.outputTokens ?? 0), latencyMs, costUsd: result?.costUsd ?? (invalidOutput?.usage.costUsd ?? 0) + (queryUsage?.costUsd ?? 0), outcome: "error", errorMessage: routingFailure ? `${routingFailure.fallbackModel}: ${routingFailure.fallbackFailure}` : message, intent: result?.output.intent, confidence: result?.output.confidence, retrievedEntries: result?.entries ?? failureDetails.supportMetadata?.entries, usageEstimated: result?.usageEstimated ?? invalidOutput?.usage.usageEstimated ?? queryUsage?.estimated ?? false, costEstimated: result?.costEstimated ?? invalidOutput?.usage.costEstimated ?? queryUsage?.estimated ?? false, refusalReason: result?.refusalReason, retrievalConfidence: result?.retrievalConfidence ?? failureDetails.supportMetadata?.retrievalConfidence, routingDecision: result?.routingDecision ?? "generation_error", routingStrategy: result?.routingStrategy ?? invalidOutput?.routingStrategy ?? parsed.data.routingStrategy, routingReason: result?.routingReason ?? invalidOutput?.routingReason ?? "backend request failed", selectedBackend: result?.selectedBackend ?? invalidOutput?.selectedBackend ?? routingFailure?.primaryModel ?? env.PRIMARY_PROVIDER, finalBackend: result?.finalBackend ?? invalidOutput?.finalBackend ?? routingFailure?.fallbackModel ?? "none", rewrittenQuery: result?.rewrittenQuery ?? failureDetails.supportMetadata?.rewrittenQuery, queryRewriteUsed: result?.queryRewriteUsed ?? failureDetails.supportMetadata?.queryRewriteUsed, evidenceAssessment: result?.evidenceAssessment ?? failureDetails.supportMetadata?.evidenceAssessment });
      } catch (meteringError) {
        const code = typeof meteringError === "object" && meteringError !== null && "code" in meteringError ? String(meteringError.code) : undefined;
        request.log.error({ err: meteringError, code }, "Failed to record inference request");
        const message = code === "42703" || code === "42P01"
          ? "Database schema is outdated. Run npm run db:migrate against the API database, then restart the API."
          : `Inference could not be recorded${code ? ` (database error ${code})` : ""}. Check the API logs.`;
        sendEvent(reply, "error", { error: message });
        return;
      }
      sendEvent(reply, "error", { requestId: logged.id, timestamp: logged.created_at, error: message });
    } finally {
      reply.raw.end();
    }
  });
}
