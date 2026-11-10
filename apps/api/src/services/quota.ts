import { db } from "../db.js";

export async function reserveQuota(tenantId: string) {
  const result = await db.query(
    "UPDATE tenants SET quota_used = quota_used + 1 WHERE id = $1 AND quota_used < quota_limit RETURNING quota_limit, quota_used",
    [tenantId]
  );
  return result.rows[0] as { quota_limit: number; quota_used: number } | undefined;
}
