import { readFile } from "node:fs/promises";
import { db, vector } from "../src/db.js";
import { hashApiKey } from "../src/services/auth.js";
import { embed } from "../src/services/retrieval.js";

type Entry = { instruction: string; response: string; intent: string };
const source = new URL("../../../data/kb.sample.json", import.meta.url);
const entries = JSON.parse(await readFile(source, "utf8")) as Entry[];
for (const [name, key, quota] of [["Demo tenant", "demo-tenant-key", 100], ["Acme Store", "acme-demo-key", 1000], ["Nova Commerce", "nova-demo-key", 2000]] as const) {
  await db.query(
    "INSERT INTO tenants (name, api_key_hash, quota_limit) VALUES ($1, $2, $3) ON CONFLICT (api_key_hash) DO UPDATE SET name = EXCLUDED.name, quota_limit = EXCLUDED.quota_limit",
    [name, hashApiKey(key), quota]
  );
}
for (const entry of entries) {
  let embedding: number[] | null = null;
  try { embedding = await embed(entry.instruction); } catch { /* seeded demo works with lexical retrieval */ }
  await db.query(
    `INSERT INTO knowledge_entries (question, answer, intent, embedding) VALUES ($1,$2,$3,$4::vector)
     ON CONFLICT (question) DO UPDATE SET answer = EXCLUDED.answer, intent = EXCLUDED.intent,
     embedding = COALESCE(EXCLUDED.embedding, knowledge_entries.embedding)`,
    [entry.instruction, entry.response, entry.intent, embedding ? vector(embedding) : null]
  );
}
await db.end();
console.log(`Seeded ${entries.length} knowledge entries`);
