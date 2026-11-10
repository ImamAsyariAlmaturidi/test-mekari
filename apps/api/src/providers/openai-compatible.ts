import OpenAI from "openai";
import { modelOutput } from "../services/chat.js";
import { InvalidModelOutputError, type ProviderInput, type ProviderResult, type ProviderStream } from "./types.js";

type Settings = {
  apiKey?: string;
  model?: string;
  baseURL?: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  headers?: Record<string, string>;
};

function answerFieldEmitter(onDelta: ProviderStream["onDelta"]) {
  let prefix = "";
  let started = false;
  let ended = false;
  let escaped = false;
  let unicode = "";
  let emitted = false;

  return {
    get emitted() { return emitted; },
    get ended() { return ended; },
    push(chunk: string) {
      if (ended) return;
      if (!started) {
        prefix += chunk;
        const match = /"answer"\s*:\s*"/i.exec(prefix);
        if (!match || match.index === undefined) {
          prefix = prefix.slice(-32);
          return;
        }
        started = true;
        chunk = prefix.slice(match.index + match[0].length);
        prefix = "";
      }

      let text = "";
      for (const char of chunk) {
        if (unicode) {
          unicode += char;
          if (unicode.length === 5) {
            text += String.fromCharCode(Number.parseInt(unicode.slice(1), 16));
            unicode = "";
            escaped = false;
          }
        } else if (escaped) {
          if (char === "u") unicode = "u";
          else {
            text += ({ '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" } as Record<string, string>)[char] ?? char;
            escaped = false;
          }
        } else if (char === "\\") escaped = true;
        else if (char === '"') { ended = true; break; }
        else text += char;
      }
      if (text) { emitted = true; onDelta(text); }
    }
  };
}

function parseOutput(raw: string, usage: Omit<ProviderResult, "output">): ProviderResult["output"] {
  try { return modelOutput.parse(JSON.parse(raw)); }
  catch (error) { throw new InvalidModelOutputError(usage, error); }
}

export async function answerWithOpenAICompatibleProvider(input: ProviderInput, settings: Settings, stream?: ProviderStream): Promise<ProviderResult> {
  if (!settings.apiKey) throw new Error("Provider API key is not configured");
  if (!settings.model) throw new Error("Provider model is not configured");
  const client = new OpenAI({ apiKey: settings.apiKey, baseURL: settings.baseURL, defaultHeaders: settings.headers, timeout: 8_000 });
  const knowledge = input.entries.map((entry, index) => `${index + 1}. Intent: ${entry.intent}\nQ: ${entry.question}\nA: ${entry.answer}`).join("\n\n");
  const messages = [
    { role: "system" as const, content: `You are an English-language customer-support assistant. First decide whether the supplied knowledge contains enough concrete information to answer the user's question. If not, do not guess: return a brief refusal and set refusalReason to "insufficient_information". Otherwise answer in English using only the supplied knowledge. Be concise and direct, removing conversational filler while preserving every relevant step, condition, caveat, and alternative. Do not invent steps, URLs, timelines, policies, guarantees, or contact details. For a greeting without a support question, greet the user in English and ask how you can help; use intent "greeting" and refusalReason null. Return JSON with answer, intent, confidence (0-1), and refusalReason ("insufficient_information" or null). ${input.concise ? "Keep under 35 words only when doing so preserves all relevant meaning." : ""}` },
    { role: "system" as const, content: `Retrieved support knowledge:\n${knowledge}` },
    ...input.history,
    { role: "user" as const, content: input.message }
  ];
  const base = { model: settings.model, response_format: { type: "json_object" as const }, messages };

  if (stream) {
    const completion = await client.chat.completions.create({ ...base, stream: true, stream_options: { include_usage: true } });
    const emitter = answerFieldEmitter(stream.onDelta);
    let raw = "";
    let usage: { prompt_tokens: number; completion_tokens: number; cost?: number } | undefined;
    for await (const chunk of completion) {
      const content = chunk.choices[0]?.delta.content;
      if (typeof content === "string") { raw += content; emitter.push(content); }
      if (chunk.usage) usage = chunk.usage;
    }
    const usageEstimated = usage?.prompt_tokens === undefined || usage.completion_tokens === undefined;
    const inputTokens = usage?.prompt_tokens ?? Math.ceil(JSON.stringify(messages).length / 4);
    const outputTokens = usage?.completion_tokens ?? Math.ceil(raw.length / 4);
    const costUsd = usage?.cost ?? (inputTokens * settings.inputCostPerMillion + outputTokens * settings.outputCostPerMillion) / 1_000_000;
    const output = parseOutput(raw, { model: settings.model, inputTokens, outputTokens, costUsd, usageEstimated, costEstimated: usage?.cost === undefined });
    if (!emitter.emitted) stream.onDelta(output.answer);
    return { output, model: settings.model, inputTokens, outputTokens, costUsd, usageEstimated, costEstimated: usage?.cost === undefined };
  }

  const completion = await client.chat.completions.create({ ...base, stream: false });
  const raw = completion.choices[0]?.message.content;
  const content = raw ?? "";
  const usageEstimated = completion.usage?.prompt_tokens === undefined || completion.usage.completion_tokens === undefined;
  const inputTokens = completion.usage?.prompt_tokens ?? Math.ceil(JSON.stringify(messages).length / 4);
  const outputTokens = completion.usage?.completion_tokens ?? Math.ceil(content.length / 4);
  const providerCost = (completion.usage as (typeof completion.usage & { cost?: number }) | undefined)?.cost;
  const costUsd = providerCost ?? (inputTokens * settings.inputCostPerMillion + outputTokens * settings.outputCostPerMillion) / 1_000_000;
  const output = parseOutput(content, { model: settings.model, inputTokens, outputTokens, costUsd, usageEstimated, costEstimated: providerCost === undefined });
  return { output, model: settings.model, inputTokens, outputTokens, costUsd, usageEstimated, costEstimated: providerCost === undefined };
}
