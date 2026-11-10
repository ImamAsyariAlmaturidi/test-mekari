import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "../db.js";
import { env } from "../config.js";

export const hashApiKey = (key: string) => createHmac("sha256", env.API_KEY_HASH_SECRET).update(key).digest("hex");

export async function authenticate(key: string | undefined) {
  if (!key) return null;
  const hash = hashApiKey(key);
  const { rows } = await db.query("SELECT id, name, quota_limit, quota_used, api_key_hash FROM tenants WHERE api_key_hash = $1", [hash]);
  const tenant = rows[0];
  if (!tenant || !timingSafeEqual(Buffer.from(tenant.api_key_hash), Buffer.from(hash))) return null;
  return tenant as { id: string; name: string; quota_limit: number; quota_used: number };
}
