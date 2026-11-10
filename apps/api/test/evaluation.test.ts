import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { evaluationRoutes } from "../src/routes/evaluation.js";

test("evaluation endpoint reports a real saved comparison or a clear not-run state", async () => {
  const app = Fastify();
  await app.register(evaluationRoutes);
  const response = await app.inject({ method: "GET", url: "/v1/evaluation" });
  assert.equal(response.statusCode, 200);
  const result = response.json() as { available: boolean; results?: { mode: string }[] };
  if (result.available) assert.deepEqual(result.results?.map((item) => item.mode), ["direct", "rewrite"]);
  else assert.equal(result.available, false);
  await app.close();
});
