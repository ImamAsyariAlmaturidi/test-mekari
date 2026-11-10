import test from "node:test";
import assert from "node:assert/strict";
import { chatRequest, modelOutput } from "../src/services/chat.js";

test("chat contracts reject unsafe input and malformed model output", () => {
  assert.equal(chatRequest.safeParse({ message: "x" }).success, false);
  assert.equal(chatRequest.safeParse({ message: "hello", conversationId: "bad-id" }).success, false);
  assert.equal(modelOutput.safeParse({ answer: "ok", intent: "test", confidence: 2 }).success, false);
});
