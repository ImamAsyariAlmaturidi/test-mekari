import { access, readFile, writeFile } from "node:fs/promises";
import { embed } from "../../src/services/retrieval.js";
import { answerSupport } from "../../src/services/support.js";
import { env } from "../../src/config.js";
import type { Backend } from "../../src/services/router.js";

type Case = { instruction: string; response: string; intent: string };
type CaseResult = {
  index: number; question: string; expectedIntent: string; predictedIntent: string; intentCorrect: boolean;
  retrievalIntentMatch: boolean; refused: boolean; refusalReason: string | null; answer: string; model: string;
  provider: string; rewrittenQuery: string; queryRewriteUsed: boolean; retrievalConfidence: number;
  evidenceAssessment: Awaited<ReturnType<typeof answerSupport>>["evidenceAssessment"];
  retrievedEntries: Awaited<ReturnType<typeof answerSupport>>["entries"];
  answerSimilarity: number | null; latencyMs: number; costUsd: number;
};
const rootPrefix = import.meta.url.includes("/dist/") ? "../../../../../" : "../../../../";
const realEvaluation = new URL(`${rootPrefix}data/eval.json`, import.meta.url);
const fallbackEvaluation = new URL(`${rootPrefix}data/eval.sample.json`, import.meta.url);
const source = await access(realEvaluation).then(() => realEvaluation).catch(() => fallbackEvaluation);
const cases = JSON.parse(await readFile(source, "utf8")) as Case[];
const cosine = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0) / Math.sqrt(a.reduce((sum, value) => sum + value * value, 0) * b.reduce((sum, value) => sum + value * value, 0));

const modelConfigs = [
  { mode: "model_a" as const, backend: "openrouter" as const, model: env.OPENROUTER_MODEL },
  { mode: "model_b" as const, backend: "openrouter_fallback" as const, model: env.OPENROUTER_FALLBACK_MODEL }
];
if (modelConfigs.some(({ model }) => !model)) throw new Error("Set OPENROUTER_MODEL and OPENROUTER_FALLBACK_MODEL to compare two OpenRouter models");

async function evaluate(mode: "model_a" | "model_b", backend: Backend, model: string) {
  const results = [];
  const caseResults: CaseResult[] = [];
  console.log(JSON.stringify({ type: "progress", mode, model, completed: 0, total: cases.length }));
  for (const item of cases) {
    const start = performance.now();
    const answer = await answerSupport({ message: item.instruction, conversationId: "00000000-0000-4000-8000-000000000000", configuration: "standard", routingStrategy: "balanced" }, [], undefined, undefined, { routeBackend: backend });
    let quality: number | null = null;
    try { quality = cosine(await embed(answer.output.answer), await embed(item.response)); } catch { /* report quality as unavailable instead of substituting intent accuracy */ }
    const caseResult: CaseResult = {
      index: caseResults.length + 1,
      model,
      question: item.instruction,
      expectedIntent: item.intent,
      predictedIntent: answer.output.intent,
      intentCorrect: answer.output.intent === item.intent,
      retrievalIntentMatch: answer.entries.some((entry) => entry.intent === item.intent),
      refused: answer.refusalReason !== null,
      refusalReason: answer.refusalReason,
      answer: answer.output.answer,
      model: answer.model,
      provider: answer.provider,
      rewrittenQuery: answer.rewrittenQuery,
      queryRewriteUsed: answer.queryRewriteUsed,
      retrievalConfidence: answer.retrievalConfidence,
      evidenceAssessment: answer.evidenceAssessment,
      retrievedEntries: answer.entries,
      answerSimilarity: quality,
      latencyMs: Math.round(performance.now() - start),
      costUsd: answer.costUsd
    };
    caseResults.push(caseResult);
    results.push({ intentCorrect: caseResult.intentCorrect, retrievalIntentMatch: caseResult.retrievalIntentMatch, refused: caseResult.refused, quality, latencyMs: caseResult.latencyMs, costUsd: caseResult.costUsd });
    console.log(JSON.stringify({ type: "progress", mode, model, completed: results.length, total: cases.length }));
  }
  const qualityScores = results.flatMap((result) => result.quality === null ? [] : [result.quality]);
  return {
    mode,
    cases: results.length,
    intents: new Set(cases.map((item) => item.intent)).size,
    intentAccuracy: results.filter((result) => result.intentCorrect).length / results.length,
    retrievalIntentMatchRate: results.filter((result) => result.retrievalIntentMatch).length / results.length,
    refusalRate: results.filter((result) => result.refused).length / results.length,
    answerQuality: qualityScores.length === results.length ? qualityScores.reduce((sum, score) => sum + score, 0) / results.length : null,
    answerQualityMethod: "cosine similarity of OpenAI embeddings; null if embeddings are unavailable",
    averageLatencyMs: results.reduce((sum, result) => sum + result.latencyMs, 0) / results.length,
    totalCostUsd: results.reduce((sum, result) => sum + result.costUsd, 0),
    caseResults
  };
}

const output = [];
for (const config of modelConfigs) output.push(await evaluate(config.mode, config.backend, config.model!));
await writeFile(new URL(`${rootPrefix}evaluation-results.json`, import.meta.url), JSON.stringify({ source: source.pathname.split("/").pop(), generatedAt: new Date().toISOString(), cases: cases.length, results: output }, null, 2));
console.table(output);
