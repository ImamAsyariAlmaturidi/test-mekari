import type { FastifyInstance } from "fastify";
import { authenticate } from "../services/auth.js";
import { conversationBelongsToTenant, getConversationMessages } from "../services/conversations.js";

export async function conversationRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/v1/conversations/:id", async (request, reply) => {
    const suppliedKey = request.headers["x-api-key"];
    const tenant = await authenticate(Array.isArray(suppliedKey) ? suppliedKey[0] : suppliedKey);
    if (!tenant) return reply.code(401).send({ error: "Invalid or missing x-api-key" });
    if (!await conversationBelongsToTenant(request.params.id, tenant.id)) return reply.code(404).send({ error: "Conversation not found" });
    return { messages: await getConversationMessages(request.params.id, tenant.id, 100) };
  });
}
