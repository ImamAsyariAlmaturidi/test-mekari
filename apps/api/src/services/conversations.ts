import { db } from "../db.js";

export async function ensureConversation(id: string, tenantId: string) {
  await db.query("INSERT INTO conversations (id, tenant_id) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING", [id, tenantId]);
  const { rowCount } = await db.query("SELECT 1 FROM conversations WHERE id = $1 AND tenant_id = $2", [id, tenantId]);
  return Boolean(rowCount);
}

export async function conversationBelongsToTenant(id: string, tenantId: string) {
  const { rowCount } = await db.query("SELECT 1 FROM conversations WHERE id = $1 AND tenant_id = $2", [id, tenantId]);
  return Boolean(rowCount);
}

export async function getConversationMessages(id: string, tenantId: string, limit = 8) {
  const { rows } = await db.query(
    `SELECT role, content FROM (
       SELECT m.role, m.content, m.id FROM conversation_messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.id = $1 AND c.tenant_id = $2 ORDER BY m.id DESC LIMIT $3
     ) history ORDER BY id`,
    [id, tenantId, limit]
  );
  return rows as { role: "user" | "assistant"; content: string }[];
}

export async function saveConversationMessage(id: string, role: "user" | "assistant", content: string) {
  await db.query("INSERT INTO conversation_messages (conversation_id, role, content) VALUES ($1, $2, $3)", [id, role, content]);
  await db.query("UPDATE conversations SET updated_at = now() WHERE id = $1", [id]);
}
