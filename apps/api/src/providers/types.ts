import type { ModelOutput } from "../services/chat.js";

export type ProviderInput = { message: string; history: { role: "user" | "assistant"; content: string }[]; entries: { question: string; answer: string; intent: string }[]; concise: boolean };
export type ProviderResult = { output: ModelOutput; model: string; inputTokens: number; outputTokens: number; costUsd: number; usageEstimated: boolean; costEstimated: boolean };
export type ProviderStream = { onDelta(text: string): void; onReset(): void };
export class InvalidModelOutputError extends Error {
  provider?: string;
  primaryProvider?: string;
  fallbackUsed = false;
  fallbackReason: string | null = null;
  routingStrategy?: "balanced" | "cost_optimized";
  routingReason?: string;
  selectedBackend?: string;
  finalBackend?: string;
  constructor(readonly usage: Omit<ProviderResult, "output">, cause?: unknown) {
    super("Provider returned invalid structured output", { cause });
    this.name = "InvalidModelOutputError";
  }
}
export interface Provider { name: string; answer(input: ProviderInput, stream?: ProviderStream): Promise<ProviderResult>; }
