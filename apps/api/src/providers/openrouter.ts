import { env } from "../config.js";
import { answerWithOpenAICompatibleProvider } from "./openai-compatible.js";
import type { Provider, ProviderInput, ProviderResult, ProviderStream } from "./types.js";

export class OpenRouterProvider implements Provider {
  name = "openrouter";
  constructor(
    private readonly model = env.OPENROUTER_MODEL,
    private readonly inputCostPerMillion = env.OPENROUTER_INPUT_COST_PER_MILLION,
    private readonly outputCostPerMillion = env.OPENROUTER_OUTPUT_COST_PER_MILLION
  ) {}
  answer(input: ProviderInput, stream?: ProviderStream): Promise<ProviderResult> {
    return answerWithOpenAICompatibleProvider(input, {
      apiKey: env.OPENROUTER_API_KEY,
      model: this.model,
      baseURL: "https://openrouter.ai/api/v1",
      inputCostPerMillion: this.inputCostPerMillion,
      outputCostPerMillion: this.outputCostPerMillion,
      headers: { "HTTP-Referer": env.OPENROUTER_APP_URL, "X-OpenRouter-Title": "Mini Inference Router" }
    }, stream);
  }
}
