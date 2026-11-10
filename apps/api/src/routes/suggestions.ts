import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { authenticate } from "../services/auth.js";

const labels: Record<string, string> = {
  password_reset: "Reset a forgotten password",
  recover_password: "Reset a forgotten password",
  change_email: "Update the email on my account",
  edit_account: "Update my account details",
  refund_not_showing_up: "Ask about a missing refund",
  get_refund: "Ask about a refund",
  track_refund: "Track a refund"
};

export async function suggestionRoutes(app: FastifyInstance) {
  app.get("/v1/suggestions", async (request, reply) => {
    const suppliedKey = request.headers["x-api-key"];
    const tenant = await authenticate(Array.isArray(suppliedKey) ? suppliedKey[0] : suppliedKey);
    if (!tenant) return reply.code(401).send({ error: "Invalid or missing x-api-key" });
    const { rows } = await db.query(
      `WITH per_intent AS (
         SELECT DISTINCT ON (intent) intent, question FROM knowledge_entries
         WHERE length(question) BETWEEN 20 AND 120 AND question NOT LIKE '%{{%'
         ORDER BY intent, (question ~ '^[A-Z]') DESC, abs(length(question) - 55), question
       )
       SELECT intent, question FROM per_intent ORDER BY random() LIMIT 3`
    );
    return { suggestions: rows.map((row) => ({ prompt: row.question, label: labels[row.intent] ?? row.intent.replaceAll("_", " ") })) };
  });
}
