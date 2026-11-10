import { env } from "../config.js";
import type { Provider, ProviderInput, ProviderResult, ProviderStream } from "./types.js";
import { answerWithOpenAICompatibleProvider } from "./openai-compatible.js";

export class OpenAIProvider implements Provider {
  name = "openai";
  async answer(input: ProviderInput, stream?: ProviderStream): Promise<ProviderResult> {
    return answerWithOpenAICompatibleProvider(input, { apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL, inputCostPerMillion: env.MODEL_INPUT_COST_PER_MILLION, outputCostPerMillion: env.MODEL_OUTPUT_COST_PER_MILLION }, stream);
  }
}
