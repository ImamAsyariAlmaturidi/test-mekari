import type { FastifyInstance } from "fastify";
import { authenticate } from "../services/auth.js";
import { db } from "../db.js";
import { z } from "zod";

export async function usageRoutes(app: FastifyInstance) {
  app.get("/v1/usage", async (request, reply) => {
    const suppliedKey = request.headers["x-api-key"];
    const tenant = await authenticate(Array.isArray(suppliedKey) ? suppliedKey[0] : suppliedKey);
    if (!tenant) return reply.code(401).send({ error: "Invalid or missing x-api-key" });
    const { rows } = await db.query(
      "SELECT count(*)::int AS requests, coalesce(sum(cost_usd), 0)::float AS cost_usd FROM request_logs WHERE tenant_id = $1",
      [tenant.id]
    );
    return { tenant: tenant.name, requests: rows[0].requests, costUsd: rows[0].cost_usd, quotaLimit: tenant.quota_limit, quotaUsed: tenant.quota_used, remainingQuota: tenant.quota_limit - tenant.quota_used };
  });

  app.get("/v1/analytics", async (request, reply) => {
    const suppliedKey = request.headers["x-api-key"];
    const tenant = await authenticate(Array.isArray(suppliedKey) ? suppliedKey[0] : suppliedKey);
    if (!tenant) return reply.code(401).send({ error: "Invalid or missing x-api-key" });
    const { rows } = await db.query(
      `SELECT count(*)::int AS requests,
        coalesce(sum(input_tokens), 0)::int AS input_tokens,
        coalesce(sum(output_tokens), 0)::int AS output_tokens,
        coalesce(sum(cost_usd), 0)::float AS cost_usd,
        coalesce(round(avg(latency_ms)), 0)::int AS average_latency_ms,
        coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)::int AS p95_latency_ms,
        count(*) FILTER (WHERE outcome = 'success')::int AS successful_requests,
        count(*) FILTER (WHERE outcome = 'refused')::int AS refused_requests,
        count(*) FILTER (WHERE outcome = 'error')::int AS failed_requests,
        count(*) FILTER (WHERE outcome = 'quota_exceeded')::int AS quota_exceeded_requests,
        count(*) FILTER (WHERE fallback_used)::int AS fallback_requests,
        count(*) FILTER (WHERE usage_estimated)::int AS estimated_usage_requests,
        count(*) FILTER (WHERE cost_estimated)::int AS estimated_cost_requests
       FROM request_logs WHERE tenant_id = $1`,
      [tenant.id]
    );
    const [daily, models, providers, outcomes] = await Promise.all([
      db.query(
        `SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
          count(logs.id)::int AS requests, coalesce(sum(logs.cost_usd), 0)::float AS cost_usd
         FROM generate_series(CURRENT_DATE - interval '6 days', CURRENT_DATE, interval '1 day') AS days(day)
         LEFT JOIN request_logs AS logs ON logs.tenant_id = $1 AND logs.created_at >= days.day AND logs.created_at < days.day + interval '1 day'
         GROUP BY days.day ORDER BY days.day`,
        [tenant.id]
      ),
      db.query(
        `SELECT model, count(*)::int AS requests, coalesce(sum(cost_usd), 0)::float AS cost_usd
         FROM request_logs WHERE tenant_id = $1 GROUP BY model ORDER BY requests DESC`,
        [tenant.id]
      ),
      db.query(
        `SELECT coalesce(provider, primary_model) AS provider, count(*)::int AS requests, coalesce(sum(cost_usd), 0)::float AS cost_usd
         FROM request_logs WHERE tenant_id = $1 GROUP BY coalesce(provider, primary_model) ORDER BY requests DESC`,
        [tenant.id]
      ),
      db.query(
        `SELECT outcome, count(*)::int AS requests FROM request_logs
         WHERE tenant_id = $1 GROUP BY outcome ORDER BY outcome`,
        [tenant.id]
      )
    ]);
    return {
      tenant: tenant.name,
      quotaLimit: tenant.quota_limit,
      quotaUsed: tenant.quota_used,
      remainingQuota: tenant.quota_limit - tenant.quota_used,
      ...rows[0],
      daily: daily.rows,
      models: models.rows,
      providers: providers.rows,
      outcomes: outcomes.rows
    };
  });

  app.get("/v1/requests", async (request, reply) => {
    const suppliedKey = request.headers["x-api-key"];
    const tenant = await authenticate(Array.isArray(suppliedKey) ? suppliedKey[0] : suppliedKey);
    if (!tenant) return reply.code(401).send({ error: "Invalid or missing x-api-key" });
    const { rows } = await db.query(
      `SELECT id, created_at, model, provider, primary_model, fallback_used, fallback_reason, input_tokens, output_tokens, latency_ms, cost_usd, outcome, intent, confidence, retrieved_entries, error_message, usage_estimated, cost_estimated, refusal_reason, retrieval_confidence, routing_decision, routing_strategy, routing_reason, selected_backend, final_backend, rewritten_query, query_rewrite_used, evidence_assessment
       FROM request_logs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [tenant.id]
    );
    return { tenant: tenant.name, requests: rows.map((row) => ({ ...row, cost_usd: Number(row.cost_usd) })) };
  });

  app.get<{ Params: { id: string } }>("/v1/requests/:id", async (request, reply) => {
    const suppliedKey = request.headers["x-api-key"];
    const tenant = await authenticate(Array.isArray(suppliedKey) ? suppliedKey[0] : suppliedKey);
    if (!tenant) return reply.code(401).send({ error: "Invalid or missing x-api-key" });
    if (!z.string().uuid().safeParse(request.params.id).success) return reply.code(400).send({ error: "Invalid request ID" });
    const { rows } = await db.query(
      `SELECT id, created_at, model, provider, primary_model, fallback_used, fallback_reason, input_tokens, output_tokens, latency_ms, cost_usd, outcome, intent, confidence, retrieved_entries, error_message, usage_estimated, cost_estimated, refusal_reason, retrieval_confidence, routing_decision, routing_strategy, routing_reason, selected_backend, final_backend, rewritten_query, query_rewrite_used, evidence_assessment
       FROM request_logs WHERE tenant_id = $1 AND id = $2`,
      [tenant.id, request.params.id]
    );
    if (!rows[0]) return reply.code(404).send({ error: "Request not found" });
    return { tenant: tenant.name, request: { ...rows[0], cost_usd: Number(rows[0].cost_usd) } };
  });
}
