import test from "node:test";
import assert from "node:assert/strict";
import { MockProvider } from "../src/providers/mock.js";
import type { Provider } from "../src/providers/types.js";
import { route, selectBackends } from "../src/services/router.js";

const configured = { openrouter: true, openrouter_fallback: true, openai: false };
const rates = { openrouter: 1.4, openrouter_fallback: 14, openai: 0 };

test("balanced routing selects GPT-5.6 Luna with GPT-5.6 Terra as its fallback", () => {
  const selected = selectBackends("balanced", { configured, estimatedRates: rates });
  assert.equal(selected.primary, "openrouter");
  assert.equal(selected.fallback, "openrouter_fallback");
  assert.match(selected.reason, /selected by balanced model priority/);
});

test("cost-optimized routing compares configured model token rates", () => {
  const selected = selectBackends("cost_optimized", { configured, estimatedRates: rates });
  assert.equal(selected.primary, "openrouter");
  assert.equal(selected.fallback, "openrouter_fallback");
  assert.match(selected.reason, /lowest configured estimated token rate/);
});

test("mock provider returns the top retrieved entry", async () => {
  const result = await new MockProvider().answer({ message: "forgot password", history: [], concise: false, entries: [{ question: "forgot password", answer: "Reset it.", intent: "password_reset" }] });
  assert.equal(result.output.intent, "password_reset");
  assert.equal(result.output.answer, "Reset it.");
});

test("a failed primary OpenRouter model streams a reset then serves through the fallback model", async () => {
  const events: string[] = [];
  const makeModel = (name: string, fail: boolean): Provider => ({
    name: "openrouter",
    async answer(_input, stream) {
      if (fail) { stream?.onDelta("partial"); throw new Error("primary timed out"); }
      stream?.onDelta("fallback answer");
      return { output: { answer: "fallback answer", intent: "password_reset", confidence: 0.9 }, model: name, inputTokens: 10, outputTokens: 5, costUsd: 0.001, usageEstimated: false, costEstimated: false };
    }
  });
  const result = await route({ message: "forgot password", history: [], concise: false, entries: [] }, { onDelta: (text) => events.push(`delta:${text}`), onReset: () => events.push("reset") }, "balanced", {
    selection: { primary: "openrouter", fallback: "openrouter_fallback", reason: "test" },
    providers: { openrouter: () => makeModel("openai/gpt-5.6-luna", true), openrouter_fallback: () => makeModel("openai/gpt-5.6-terra", false) }
  });
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.primaryModel, result.selectedBackend);
  assert.equal(result.model, "openai/gpt-5.6-terra");
  assert.equal(result.finalBackend, "openai/gpt-5.6-terra");
  assert.match(result.fallbackReason ?? "", /timed out/);
  assert.deepEqual(events, ["delta:partial", "reset", "delta:fallback answer"]);
});
