import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import { db } from "../db.js";
import { hashApiKey } from "../services/auth.js";

const bodySchema = z.object({ name: z.string().trim().min(2).max(80), quotaLimit: z.number().int().positive().max(1_000_000) });

export async function tenantRoutes(app: FastifyInstance) {
  app.post("/v1/tenants", async (request, reply) => {
    if (!env.TENANT_ADMIN_KEY) return reply.code(503).send({ error: "Tenant creation is disabled; configure TENANT_ADMIN_KEY on the API." });
    const suppliedKey = request.headers["x-tenant-admin-key"];
    const supplied = Array.isArray(suppliedKey) ? suppliedKey[0] : suppliedKey;
    const expected = Buffer.from(env.TENANT_ADMIN_KEY);
    const actual = Buffer.from(supplied ?? "");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return reply.code(401).send({ error: "Invalid tenant admin key" });

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid tenant details", details: parsed.error.flatten() });
    const apiKey = `mir_${randomBytes(32).toString("base64url")}`;
    const { rows } = await db.query(
      "INSERT INTO tenants (name, api_key_hash, quota_limit) VALUES ($1, $2, $3) RETURNING name, quota_limit",
      [parsed.data.name, hashApiKey(apiKey), parsed.data.quotaLimit]
    );
    return reply.code(201).send({ tenant: rows[0], apiKey });
  });
}
