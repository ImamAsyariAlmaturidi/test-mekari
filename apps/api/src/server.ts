import Fastify from "fastify";
import cors from "@fastify/cors";
import { env, isAllowedOrigin } from "./config.js";
import { chatRoutes } from "./routes/chat.js";
import { usageRoutes } from "./routes/usage.js";
import { conversationRoutes } from "./routes/conversations.js";
import { tenantRoutes } from "./routes/tenants.js";
import { evaluationRoutes } from "./routes/evaluation.js";
import { suggestionRoutes } from "./routes/suggestions.js";

const app = Fastify({ logger: true });
await app.register(cors, {
  allowedHeaders: ["content-type", "x-api-key", "x-tenant-admin-key"],
  origin: (origin, callback) => {
    callback(null, isAllowedOrigin(origin));
  }
});
app.get("/health", async () => ({ ok: true }));
await app.register(chatRoutes);
await app.register(usageRoutes);
await app.register(conversationRoutes);
await app.register(tenantRoutes);
await app.register(evaluationRoutes);
await app.register(suggestionRoutes);
await app.listen({ port: env.PORT, host: "0.0.0.0" });
