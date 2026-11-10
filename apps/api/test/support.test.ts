import { test } from "node:test";
import assert from "node:assert/strict";
import { chatRequest } from "../src/services/chat.js";
import { answerSupport, GREETING_TEMPLATE, REFUSAL_TEMPLATE } from "../src/services/support.js";
import { type ProviderInput, type ProviderStream } from "../src/providers/types.js";
import type { RoutingResult } from "../src/services/router.js";

const english = "I forgot my password and cannot log in.";
const indonesian = "aku lupa password dan gabisa login";
const englishRewrite = "How can I reset my forgotten password and regain access to my account?";
const answer = "Use the Forgot Password link on the sign-in page, then follow the reset email.";
const entries = [{ id: "kb-password", question: english, answer, intent: "password_reset", score: 0.21, retrievalMethod: "vector" as const }];
const request = chatRequest.parse({ message: indonesian, conversationId: "00000000-0000-4000-8000-000000000001" });
const usage = { inputTokens: 10, outputTokens: 4, costUsd: 0.000002, estimated: false };
const deps = (run: (input: ProviderInput, stream?: ProviderStream) => Promise<RoutingResult>, overrides: Record<string, unknown> = {}) => ({
  embedMany: async () => [[1], [1]], retrieve: async () => entries,
  rewrite: async () => ({ query: englishRewrite, ...usage }),
  assess: async () => ({ sufficient: true, sourceIndexes: [0], reason: "Password reset procedure directly answers the question.", ...usage }),
  route: run, ...overrides
});
function routed(outputAnswer = answer, confidence = 0.1, refusalReason: "insufficient_information" | null = null): RoutingResult {
  return { output: { answer: outputAnswer, intent: "password_reset", confidence, refusalReason }, model: "test-model", provider: "test", primaryModel: "test", fallbackUsed: false, fallbackReason: null, inputTokens: 12, outputTokens: 8, costUsd: 0.01, usageEstimated: false, costEstimated: false, routingStrategy: "balanced", routingReason: "test", selectedBackend: "test", finalBackend: "test" };
}

test("Indonesian query retrieves English Bitext evidence and streams answer without reset", async () => {
  const events: string[] = [];
  const searches: string[] = [];
  const answerFn = "Choose the password recovery option on the sign-in screen, then follow the reset email instructions.";
  const result = await answerSupport(request, [], { onDelta: (text) => events.push(text), onReset: () => events.push("RESET") }, deps(async (input, stream) => {
    assert.equal(input.message, englishRewrite);
    assert.equal(input.entries[0].intent, "password_reset");
    stream?.onDelta(answerFn);
    return routed(answerFn, 0.01);
  }, { retrieve: async (query: string) => { searches.push(query); return entries; } }), { rewriteQuery: true });
  assert.deepEqual(searches, [indonesian, englishRewrite]);
  assert.equal(result.refusalReason, null);
  assert.equal(result.output.answer, answerFn);
  assert.equal(result.rewrittenQuery, englishRewrite);
  assert.equal(result.queryRewriteUsed, true);
  assert.equal(result.inputTokens, 32);
  assert.equal(result.outputTokens, 16);
  assert.deepEqual(events, [answerFn]);
});

test("refuses before answer generation when retrieval has no usable candidates", async () => {
  let generated = false;
  const events: string[] = [];
  const result = await answerSupport(request, [], { onDelta: (text) => events.push(text), onReset: () => events.push("RESET") }, deps(async () => { generated = true; return routed(); }, { retrieve: async () => [] }));
  assert.equal(generated, false);
  assert.equal(result.refusalReason, "no_usable_evidence");
  assert.equal(result.output.answer, REFUSAL_TEMPLATE);
  assert.equal(result.outputTokens, 0); // no query rewrite, evidence check, or answer generation ran
  assert.deepEqual(events, [REFUSAL_TEMPLATE]);
});

test("evidence assessment, not a fixed similarity cutoff, determines pre-generation refusal", async () => {
  let generated = false;
  const result = await answerSupport(request, [], undefined, deps(async () => { generated = true; return routed(); }, {
    assess: async () => ({ sufficient: false, sourceIndexes: [], reason: "Retrieved content does not answer this question.", ...usage })
  }));
  assert.equal(generated, false);
  assert.equal(result.retrievalConfidence, 0.21);
  assert.equal(result.refusalReason, "no_usable_evidence");
  assert.equal(result.evidenceAssessment?.reason, "Retrieved content does not answer this question.");
});

test("preserves a model's explicit insufficient-information response without replacing streamed text", async () => {
  const events: string[] = [];
  const modelRefusal = "I do not have enough information in the available support articles to answer that.";
  const result = await answerSupport(request, [], { onDelta: (text) => events.push(text), onReset: () => events.push("RESET") }, deps(async (_input, stream) => {
    stream?.onDelta(modelRefusal);
    return routed(modelRefusal, 0.99, "insufficient_information");
  }));
  assert.equal(result.refusalReason, "insufficient_information");
  assert.equal(result.output.answer, modelRefusal);
  assert.deepEqual(events, [modelRefusal]);
});

test("greetings bypass retrieval and answer model", async () => {
  let generated = false;
  const hello = chatRequest.parse({ ...request, message: "hello" });
  const result = await answerSupport(hello, [], undefined, deps(async () => { generated = true; return routed(); }));
  assert.equal(generated, false);
  assert.equal(result.output.answer, GREETING_TEMPLATE);
  assert.equal(result.output.intent, "greeting");
});
