import { MockProvider } from "../providers/mock.js";
import { OpenAIProvider } from "../providers/openai.js";
import { OpenRouterProvider } from "../providers/openrouter.js";
import { env } from "../config.js";
import { InvalidModelOutputError, type Provider, type ProviderInput, type ProviderResult, type ProviderStream } from "../providers/types.js";

export type RoutingStrategy = "balanced" | "cost_optimized";
type Backend = "openrouter" | "openrouter_fallback" | "openai" | "mock";
export type RoutingResult = ProviderResult & {
  provider: string; fallbackUsed: boolean; fallbackReason: string | null; primaryModel: string;
  routingStrategy: RoutingStrategy; routingReason: string; selectedBackend: string; finalBackend: string;
};
export class RoutingFailure extends Error {
  constructor(readonly primaryModel: string, readonly fallbackModel: string, readonly primaryFailure: string, readonly fallbackFailure: string) {
    super(`Primary provider failed: ${primaryFailure}; fallback provider failed: ${fallbackFailure}`);
    this.name = "RoutingFailure";
  }
}

const providers: Record<Backend, () => Provider> = {
  openrouter: () => new OpenRouterProvider(),
  openrouter_fallback: () => new OpenRouterProvider(env.OPENROUTER_FALLBACK_MODEL, env.OPENROUTER_FALLBACK_INPUT_COST_PER_MILLION, env.OPENROUTER_FALLBACK_OUTPUT_COST_PER_MILLION),
  openai: () => new OpenAIProvider(), mock: () => new MockProvider()
};
const modelFor = (backend: Backend) => ({
  openrouter: env.OPENROUTER_MODEL ?? "openrouter",
  openrouter_fallback: env.OPENROUTER_FALLBACK_MODEL ?? "openrouter fallback model",
  openai: env.OPENAI_MODEL,
  mock: "mock-support-v1"
})[backend];
const configured = {
  openrouter: Boolean(env.OPENROUTER_API_KEY && env.OPENROUTER_MODEL),
  openrouter_fallback: Boolean(env.OPENROUTER_API_KEY && env.OPENROUTER_FALLBACK_MODEL),
  openai: Boolean(env.OPENAI_API_KEY)
};
const estimatedRates = {
  openrouter: env.OPENROUTER_INPUT_COST_PER_MILLION + env.OPENROUTER_OUTPUT_COST_PER_MILLION,
  openrouter_fallback: env.OPENROUTER_FALLBACK_INPUT_COST_PER_MILLION + env.OPENROUTER_FALLBACK_OUTPUT_COST_PER_MILLION,
  openai: env.MODEL_INPUT_COST_PER_MILLION + env.MODEL_OUTPUT_COST_PER_MILLION
};
const balancedOrder = ["openrouter", "openrouter_fallback", "openai"] as const;
const costOrder = ["openrouter", "openrouter_fallback", "openai"] as const;
type RealBackend = (typeof balancedOrder)[number];
type SelectionOptions = { configured: Record<RealBackend, boolean>; estimatedRates: Record<RealBackend, number> };

export function selectBackends(strategy: RoutingStrategy, options: SelectionOptions = { configured, estimatedRates }) {
  const available = balancedOrder.filter((backend) => options.configured[backend]);
  const ordered = strategy === "balanced"
    ? [...available]
    : [...available].sort((a, b) => {
      const aRate = options.estimatedRates[a], bRate = options.estimatedRates[b];
      return aRate > 0 && bRate > 0 && aRate !== bRate ? aRate - bRate : costOrder.indexOf(a) - costOrder.indexOf(b);
    });
  const primary = ordered[0] ?? env.PRIMARY_PROVIDER;
  const fallback = ordered.find((backend) => backend !== primary) ?? (env.FALLBACK_PROVIDER !== primary ? env.FALLBACK_PROVIDER : "mock");
  let reason: string;
  if (!ordered.length) reason = `No real backend configured; using ${primary}`;
  else if (ordered.length === 1) reason = `${modelFor(primary)} is the only configured real model`;
  else if (strategy === "balanced") reason = `${modelFor(primary)} selected by balanced model priority`;
  else if (options.estimatedRates[ordered[0]] <= 0 || options.estimatedRates[ordered[1]] <= 0 || options.estimatedRates[ordered[0]] === options.estimatedRates[ordered[1]]) reason = `Estimated rates tied or unavailable; ${modelFor(primary)} wins cost-optimized tie-break`;
  else reason = `${modelFor(primary)} has the lowest configured estimated token rate`;
  return { primary, fallback, reason };
}

export async function route(input: ProviderInput, stream?: ProviderStream, strategy: RoutingStrategy = "balanced", testOptions?: {
  selection: ReturnType<typeof selectBackends>;
  providers: Partial<Record<Backend, () => Provider>>;
}): Promise<RoutingResult> {
  const selection = testOptions?.selection ?? selectBackends(strategy);
  const getProvider = (backend: Backend) => (testOptions?.providers[backend] ?? providers[backend])();
  const primary = getProvider(selection.primary);
  const fallback = getProvider(selection.fallback);
  const primaryModel = modelFor(selection.primary);
  const selectedBackend = primaryModel;
  try {
    const result = await primary.answer(input, stream);
    return { ...result, provider: primary.name, fallbackUsed: false, fallbackReason: null, primaryModel: result.model,
      routingStrategy: strategy, routingReason: selection.reason, selectedBackend, finalBackend: result.model };
  } catch (error) {
    if (error instanceof InvalidModelOutputError) {
      Object.assign(error, { provider: primary.name, primaryProvider: primaryModel, routingStrategy: strategy, routingReason: selection.reason, selectedBackend, finalBackend: primaryModel });
      throw error;
    }
    stream?.onReset();
    const primaryFailure = error instanceof Error ? error.message : "Primary provider failed";
    try {
      const result = await fallback.answer(input, stream);
      return { ...result, provider: fallback.name, fallbackUsed: true, fallbackReason: primaryFailure, primaryModel,
        routingStrategy: strategy, routingReason: selection.reason, selectedBackend, finalBackend: result.model };
    } catch (fallbackError) {
      if (fallbackError instanceof InvalidModelOutputError) {
        Object.assign(fallbackError, { provider: fallback.name, primaryProvider: primaryModel, fallbackUsed: true, fallbackReason: primaryFailure,
          routingStrategy: strategy, routingReason: selection.reason, selectedBackend, finalBackend: modelFor(selection.fallback) });
        throw fallbackError;
      }
      throw new RoutingFailure(primaryModel, modelFor(selection.fallback), primaryFailure, fallbackError instanceof Error ? fallbackError.message : "Fallback provider failed");
    }
  }
}
