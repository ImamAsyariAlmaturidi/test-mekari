import { z } from "zod";

export const chatRequest = z.object({
  message: z.string().trim().min(3).max(2_000),
  conversationId: z.string().uuid(),
  configuration: z.enum(["standard", "concise"]).default("standard"),
  routingStrategy: z.enum(["balanced", "cost_optimized"]).default("balanced")
});

export const modelOutput = z.object({
  answer: z.string().trim().min(1).max(2_000),
  intent: z.string().trim().min(1).max(100),
  confidence: z.number().min(0).max(1),
  refusalReason: z.enum(["insufficient_information"]).nullable().optional()
});

export type ChatRequest = z.infer<typeof chatRequest>;
export type ModelOutput = z.infer<typeof modelOutput>;
