import OpenAI from "openai";
import { z } from "zod";
import { env } from "../config.js";
import type { RetrievedEntry } from "./retrieval.js";

const client = () => {
  if (!env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is required for query understanding");
  return new OpenAI({ apiKey: env.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1", defaultHeaders: { "HTTP-Referer": env.OPENROUTER_APP_URL, "X-OpenRouter-Title": "Mini Inference Router" }, timeout: 8_000 });
};
const usageSchema = z.object({ prompt_tokens: z.number().int().nonnegative().optional(), completion_tokens: z.number().int().nonnegative().optional(), cost: z.number().nonnegative().optional() }).passthrough();
const usageOf = (usage: unknown, input: string, output: string) => {
  const parsed = usageSchema.safeParse(usage);
  const inputTokens = parsed.success ? parsed.data.prompt_tokens : undefined;
  const outputTokens = parsed.success ? parsed.data.completion_tokens : undefined;
  const inputCount = inputTokens ?? Math.ceil(input.length / 4);
  const outputCount = outputTokens ?? Math.ceil(output.length / 4);
  return { inputTokens: inputCount, outputTokens: outputCount, costUsd: parsed.success && parsed.data.cost !== undefined ? parsed.data.cost : (inputCount * env.OPENROUTER_QUERY_INPUT_COST_PER_MILLION + outputCount * env.OPENROUTER_QUERY_OUTPUT_COST_PER_MILLION) / 1_000_000, estimated: inputTokens === undefined || outputTokens === undefined || !parsed.success || parsed.data.cost === undefined };
};
async function ask(system: string, payload: unknown) {
  const input = JSON.stringify(payload);
  const result = await client().chat.completions.create({ model: env.OPENROUTER_QUERY_MODEL, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: input }] });
  const content = result.choices[0]?.message.content ?? "";
  return { content, usage: usageOf(result.usage, `${system}\n${input}`, content) };
}

export async function rewriteQuery(message: string) {
  const system = "Rewrite the user's customer-support question as one concise, standalone English search query. Translate if needed. Preserve intent and all stated facts; do not infer or add details. Return JSON: {\"query\": string}.";
  const result = await ask(system, { question: message });
  const query = z.object({ query: z.string().trim().min(1).max(2000) }).parse(JSON.parse(result.content)).query;
  return { query, ...result.usage };
}

const evidenceSchema = z.object({ sufficient: z.boolean(), sourceIndexes: z.array(z.number().int().min(0)), reason: z.string().trim().min(1).max(300) });
export async function assessEvidence(question: string, entries: RetrievedEntry[]) {
  const system = "Decide whether the listed customer-support evidence contains enough concrete information to answer the user's exact question. Judge meaning, including translation/paraphrase. Do not use similarity scores as the decision. Generic prompts asking the customer to clarify are not answer evidence. If evidence does not directly support an answer, return sufficient=false and no indexes. If it does, return only indexes whose content supports the answer. Return JSON: {\"sufficient\": boolean, \"sourceIndexes\": number[], \"reason\": string}.";
  const result = await ask(system, { question, evidence: entries.map(({ question: q, answer, intent }, index) => ({ index, intent, question: q, answer })) });
  const parsed = evidenceSchema.parse(JSON.parse(result.content));
  const sourceIndexes = [...new Set(parsed.sourceIndexes)].filter((index) => index < entries.length);
  return { sufficient: parsed.sufficient && sourceIndexes.length > 0, sourceIndexes, reason: parsed.reason, ...result.usage };
}
