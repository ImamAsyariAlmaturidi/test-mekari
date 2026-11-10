import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAssistantStreamEvent } from "../lib/chat-stream.js";

test("frontend reset clears every streamed character before displaying refusal", () => {
  const initial = [{ id: "assistant-1", content: "" }, { id: "assistant-2", content: "keep" }];
  const streamed = applyAssistantStreamEvent(initial, "assistant-1", "delta", "unsupported partial answer");
  const reset = applyAssistantStreamEvent(streamed, "assistant-1", "reset");
  const refused = applyAssistantStreamEvent(reset, "assistant-1", "delta", "I cannot answer that reliably.");
  assert.equal(refused[0].content, "I cannot answer that reliably.");
  assert.equal(refused[1].content, "keep");
});
