# Technical report

The API authenticates every request with a tenant key, reserves quota atomically before model work, retrieves the top three relevant support entries through pgvector cosine distance, and stores request metering after completion. The playground receives answer deltas from the provider stream through SSE. If the primary fails after emitting partial text, a reset event clears it before fallback output is sent.

Routing uses OpenRouter GPT-5.6 Luna as the balanced primary and GPT-5.6 Terra as the next configured model. The cost-optimized strategy compares configured token prices. A provider error or eight-second timeout retries once through the other model; mock remains available when no second real model is configured. Request logs preserve model IDs, fallback reason, usage, cost, latency, and outcome.

The model receives retrieved entries and must return JSON containing `answer`, `intent`, and `confidence`. Zod validates the result. The server validates each answer claim using OpenRouter embedding cosine similarity against retrieved questions and answers, and checks URLs, email addresses, numbers, and policy claims for support. Model confidence is logged but is not used as the sole acceptance criterion. Unsupported or invalid output triggers an SSE reset and deterministic refusal.

The Bitext ingestion script deduplicates the source's 26,872 rows, skips clarification-only responses, samples 100 knowledge entries per each of 27 intents, and reserves 30 held-out cases across those intents. The held-out file is prepared at `data/eval.json`. Evaluation runs standard and concise prompt configurations and reports intent accuracy, answer embedding similarity, latency, and model cost. Answer similarity is a proxy for quality and needs manual spot checks. The pgvector ingestion and live evaluation still need to run against the local database and a rotated OpenRouter key; no benchmark results are claimed yet.

## Current limitations

- The original Bitext CSV is local and is not committed; run the documented ingestion command to prepare the sample and held-out cases.
- The evaluation script reports embedding similarity as a proxy; it is not human-reviewed answer-quality scoring.
- Usage charts are scoped to the authenticated tenant. A global tenant dashboard would require a separate admin authentication boundary.
- Railway configuration is included; live deployment, GitHub publication, and demo recording are intentionally deferred.
- Streaming token usage may be estimated when a provider omits usage in its final stream chunk.
