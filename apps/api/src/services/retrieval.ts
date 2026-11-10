import OpenAI from "openai";
import { db, vector } from "../db.js";
import { env } from "../config.js";

export type RetrievedEntry = { id: string; question: string; answer: string; intent: string; score: number; retrievalMethod: "vector" | "lexical" };

export async function embedMany(texts: string[]) {
  if (!env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is required to generate embeddings");
  if (!texts.length) return [];
  const client = new OpenAI({ apiKey: env.OPENROUTER_API_KEY, baseURL: "https://openrouter.ai/api/v1" });
  const result = await client.embeddings.create({ model: env.OPENROUTER_EMBEDDING_MODEL, input: texts, dimensions: 1536 });
  return result.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
}

export async function embed(text: string) {
  return (await embedMany([text]))[0];
}

export async function retrieve(message: string, embedding?: number[]): Promise<RetrievedEntry[]> {
  if (embedding) {
    const { rows } = await db.query(
      `SELECT id, question, answer, intent, 1 - (embedding <=> $1::vector) AS score
       FROM knowledge_entries WHERE embedding IS NOT NULL ORDER BY embedding <=> $1::vector LIMIT 3`,
      [vector(embedding)]
    );
    if (rows.length) {
      return rows.map((row) => ({ ...row, score: Number(row.score), retrievalMethod: "vector" as const }));
    }
  }

  // shortcut: lexical retrieval is only for demo mode without an API key; use embeddings in deployment.
  const { rows } = await db.query(
    `SELECT id, question, answer, intent,
      similarity(lower(question), lower($1)) AS score
     FROM knowledge_entries ORDER BY similarity(lower(question), lower($1)) DESC LIMIT 3`,
    [message]
  );
  return rows.map((row) => ({ ...row, score: Number(row.score), retrievalMethod: "lexical" as const }));
}
