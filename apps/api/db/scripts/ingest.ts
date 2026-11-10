import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { db, vector } from "../../src/db.js";
import { embedMany } from "../../src/services/retrieval.js";
import { parseBitextCsv, prepareBitextRows, type BitextRow } from "../../src/services/bitext.js";

const datasetPath = process.argv[2];
if (!datasetPath) throw new Error("Usage: npm run ingest -- data/Bitext_Sample_Customer_Support_Training_Dataset_27K_responses-v11.csv");
const projectRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const inputPath = isAbsolute(datasetPath) ? datasetPath : resolve(projectRoot, datasetPath);
const content = await readFile(inputPath, "utf8");
const sourceRows: BitextRow[] = inputPath.toLowerCase().endsWith(".csv") ? parseBitextCsv(content) : JSON.parse(content);
if (!Array.isArray(sourceRows) || sourceRows.some((row) => !row || typeof row.instruction !== "string" || typeof row.response !== "string" || typeof row.intent !== "string" || !row.instruction.trim() || !row.response.trim() || !row.intent.trim())) {
  throw new Error("Dataset must contain non-empty instruction, response, and intent fields");
}
const rows = prepareBitextRows(sourceRows);
const byIntent = new Map<string, BitextRow[]>();
for (const row of rows) byIntent.set(row.intent, [...(byIntent.get(row.intent) ?? []), row]);
if (byIntent.size !== 27) throw new Error(`Expected 27 Bitext intents; found ${byIntent.size}`);
if ([...byIntent.values()].some((group) => group.length < 2)) throw new Error("Each intent needs at least two examples for a held-out split");

const evaluation: BitextRow[] = [];
const groups = [...byIntent.values()];
for (const group of groups) evaluation.push(group[group.length - 1]);
for (let offset = 1; evaluation.length < 30; offset++) {
  for (const group of groups) {
    if (evaluation.length === 30) break;
    if (group.length > offset) evaluation.push(group[group.length - 1 - offset]);
  }
}
if (evaluation.length !== 30) throw new Error("Dataset needs at least 30 held-out rows across its intents");
const heldOut = new Set(evaluation);
const trainingByIntent = groups.map((group) => group.filter((row) => !heldOut.has(row)));
const knowledge = trainingByIntent.flatMap((group) => Array.from({ length: Math.min(100, group.length) }, (_, index) => group[Math.floor(index * group.length / Math.min(100, group.length))]));

try {
  for (let offset = 0; offset < knowledge.length; offset += 100) {
    const batch = knowledge.slice(offset, offset + 100);
    const embeddings = await embedMany(batch.map((row) => row.instruction));
    const values: unknown[] = [];
    const placeholders = batch.map((row, index) => {
      const base = index * 4;
      values.push(row.instruction, row.response, row.intent, vector(embeddings[index]));
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::vector)`;
    });
    await db.query(
      `INSERT INTO knowledge_entries (question, answer, intent, embedding) VALUES ${placeholders.join(",")}
       ON CONFLICT (question) DO UPDATE SET answer = EXCLUDED.answer, intent = EXCLUDED.intent, embedding = EXCLUDED.embedding`,
      values
    );
  }
  const sample = JSON.parse(await readFile(new URL("../../../../data/kb.sample.json", import.meta.url), "utf8")) as { instruction: string }[];
  const knowledgeQuestions = new Set(knowledge.map((row) => row.instruction));
  const staleQuestions = [...new Set([...rows.map((row) => row.instruction), ...sample.map((row) => row.instruction)])].filter((question) => !knowledgeQuestions.has(question));
  if (staleQuestions.length) await db.query("DELETE FROM knowledge_entries WHERE question = ANY($1::text[])", [staleQuestions]);
  await writeFile(new URL("../../../../data/eval.json", import.meta.url), JSON.stringify(evaluation, null, 2));
  console.log(`Prepared ${sourceRows.length} rows: ${rows.length} unique usable rows; ingested ${knowledge.length} entries across ${byIntent.size} intents; wrote ${evaluation.length} held-out cases.`);
} finally {
  await db.end();
}
