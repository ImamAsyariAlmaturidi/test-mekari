import { readdir, readFile } from "node:fs/promises";
import { db } from "../src/db.js";

const migrations = await readdir(new URL("./migrations/", import.meta.url));
for (const migration of migrations.filter((file) => file.endsWith(".sql")).sort()) {
  await db.query(await readFile(new URL(`./migrations/${migration}`, import.meta.url), "utf8"));
}
const required = ["provider", "intent", "confidence", "retrieved_entries", "error_message", "usage_estimated", "cost_estimated", "refusal_reason", "retrieval_confidence", "routing_decision", "routing_strategy", "routing_reason", "selected_backend", "final_backend", "grounding_score", "grounding_evidence", "rewritten_query", "query_rewrite_used", "evidence_assessment"];
const { rows } = await db.query(
  "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'request_logs' AND column_name = ANY($1::text[])",
  [required]
);
const missing = required.filter((column) => !rows.some((row) => row.column_name === column));
await db.end();
if (missing.length) throw new Error(`request_logs migration incomplete: ${missing.join(", ")}`);
console.log("Migration complete: request, routing, and retrieval diagnostics ready");
