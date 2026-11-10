# Video demo script (3–4 minutes)

1. Show the deployed services and public web URL.
2. Open the playground and send a password-reset question with `demo-tenant-key`.
3. Show the answer arriving from the provider SSE stream, then show the retrieved entry, intent, confidence, model, token count, latency, cost, and remaining quota.
4. Temporarily set `OPENROUTER_MODEL` to an unavailable model ID while leaving `OPENROUTER_FALLBACK_MODEL` configured. Send a request and show that GPT-5.6 Terra serves it after the primary error, with the fallback reason in the inspector and request log. Restore the primary model afterward.
5. Show the usage view and the `request_logs` row: primary model, served model, outcome, token counts, latency, and cost.
6. Run `npm run evaluate` and show the two configuration results.
7. Close with the deliberate cuts in the README: no user login, no LangChain/vector framework, and mock fallback only for demonstration.
