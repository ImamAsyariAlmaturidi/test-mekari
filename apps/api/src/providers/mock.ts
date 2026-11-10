import { env } from "../config.js";
import type { Provider, ProviderInput, ProviderResult, ProviderStream } from "./types.js";

export class MockProvider implements Provider {
  name = "mock";
  async answer(input: ProviderInput, stream?: ProviderStream): Promise<ProviderResult> {
    await new Promise((resolve) => setTimeout(resolve, env.MOCK_LATENCY_MS));
    if (Math.random() < env.MOCK_FAILURE_RATE) throw new Error("Mock provider configured to fail");
    if (/^(hai|halo|hi|hello|hey)( kak)?[!. ]*$/i.test(input.message)) {
      const answer = "Halo! Ada yang bisa saya bantu terkait akun, pembayaran, atau pesanan?";
      stream?.onDelta(answer);
      return {
        output: { answer, intent: "greeting", confidence: 0.9 },
        model: "mock-support-v1",
        inputTokens: Math.ceil(input.message.length / 4), outputTokens: Math.ceil(answer.length / 4), costUsd: 0, usageEstimated: true, costEstimated: false
      };
    }
    const entry = input.entries[0];
    if (!entry) throw new Error("No retrieved entry");
    stream?.onDelta(entry.answer);
    return {
      output: { answer: entry.answer, intent: entry.intent, confidence: 0.72 },
      model: "mock-support-v1",
      inputTokens: Math.ceil(input.message.length / 4), outputTokens: Math.ceil(entry.answer.length / 4), costUsd: 0, usageEstimated: true, costEstimated: false
    };
  }
}
