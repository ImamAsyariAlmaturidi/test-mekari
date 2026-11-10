# Mini Inference Router

Customer-support RAG gateway for the Mekari technical assessment.

## Local setup

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:migrate
npm run db:seed
npm run ingest -- data/raw/bitext.csv
npm run evaluate
npm run dev:api
npm run dev:web
```

Open `http://localhost:3000` and choose a seeded tenant in the header. Local demo keys are `demo-tenant-key`, `acme-demo-key`, and `nova-demo-key`; they are public assessment credentials, not production secrets. The Tenants page reads usage through each tenant's scoped API key; no tenant ID from the browser is trusted by the API.
To enable **Create tenant** in the header, set `TENANT_ADMIN_KEY` in the API `.env` to a random value of at least 24 characters (for example, generate one with `openssl rand -hex 32`). The dialog asks for this admin key per creation; the generated tenant API key is shown once and retained in the current browser session for switching tenants.
Chat requests use OpenRouter by default: `openai/gpt-5.6-luna` is primary and `openai/gpt-5.6-terra` is the fallback, both through `OPENROUTER_API_KEY`. Embeddings use OpenRouter's `openai/text-embedding-3-small` model through the same key; without it, retrieval falls back to lexical search.
The playground stores conversation history in PostgreSQL, scoped to the tenant API key, and reloads it after refresh. Run `npm run db:migrate` once to create the conversation tables.

## Provider adapters

Both configured chat backends are GPT models served through OpenRouter. The balanced strategy selects GPT-5.6 Luna first and GPT-5.6 Terra second. The cost-optimized strategy compares configured per-million-token rates; Luna is primary at the current rates. If Luna times out or errors, Terra is attempted. If both models are unavailable, the configured mock fallback remains available. Provider SSE tokens are passed through; if the primary fails after emitting text, a reset event clears its partial answer before fallback output is sent. Provider-reported usage is used when available; missing stream usage uses a token estimate and configured rates.

The Playground exposes two request routing strategies. `balanced` prefers GPT-5.6 Luna, then GPT-5.6 Terra, then the optional direct OpenAI adapter. `cost_optimized` compares configured model rates. The next configured model is the fallback; if none is configured, `FALLBACK_PROVIDER` is used. Provider requests have an 8-second timeout, after which fallback is attempted. The selected strategy, model IDs, routing reason, and fallback reason are recorded in request logs.

RAG does not refuse solely because retrieval similarity is low. It sends retrieved Q&A entries to the selected model, then validates each generated answer claim against the retrieved questions and answers using OpenRouter embedding cosine similarity. Unsupported URLs, email addresses, numbers, and policy or guarantee claims are also checked against the evidence. Model confidence is recorded but does not decide acceptance. Unsupported or invalid output is replaced with a deterministic refusal after an SSE reset. `RAG_MIN_RETRIEVAL_SCORE` only decides when to try lexical retrieval, not whether to refuse.

## Evaluation

`npm run evaluate` compares direct retrieval with retrieval that also uses the small model's English query rewrite, then writes `evaluation-results.json`. The Evaluation page reads this saved report and shows intent accuracy, retrieval intent match, refusal rate, answer quality, latency, and cost. The prepared `data/eval.json` contains 30 Bitext cases across 27 intents. Answer quality is cosine similarity between embeddings of generated and reference answers; it is a reproducible proxy, not human judgement. If embeddings are unavailable the quality metric is `null`, not a substitute score. The script uses the small sample file only when the Bitext evaluation file is absent.

## Bitext dataset

The original Bitext CSV is stored locally at `data/raw/bitext.csv`. After starting PostgreSQL/pgvector and setting `OPENROUTER_API_KEY`, run:

```bash
npm run db:migrate
npm run ingest -- data/raw/bitext.csv
npm run evaluate
```

The ingestion script reads the original `instruction`, `response`, and `intent` columns, deduplicates questions, skips clarification-only responses, normalizes unresolved response placeholders, and samples up to 100 KB entries per intent. It holds out 30 cases across all 27 intents, embeds KB questions into pgvector, removes stale sample rows, and writes `data/eval.json`. Set `OPENROUTER_API_KEY`; the original CSV stays local and is ignored by Git.

## Railway

Deployment is not performed by this repository setup. For Railway, create three services in one project: `web`, `api`, and PostgreSQL with pgvector. Deploy `apps/web` and `apps/api` as isolated services. Set `DATABASE_URL` on `api` from the database service, set API variables from `.env.example`, then set `NEXT_PUBLIC_API_URL` on `web` to the public API URL. Run migrations and seed/ingest the knowledge base before demoing.

## Deliberate cuts

- No user login: tenant API keys are the required authentication boundary.
- No global tenant listing or key revocation API: the UI shows seeded demo tenants and browser-created tenants, while usage remains scoped to each key; stored hashes are never returned.
- Quota counts admitted request attempts. A reserved unit is not refunded after provider failure, since a provider may already have incurred cost.
- No vector-database framework or LangChain: pgvector plus raw SQL is inspectable.
- The mock provider is for deterministic fallback demonstration, not production quality.
