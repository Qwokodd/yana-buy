import { db } from "../db/client";
import { auditLogs } from "../db/schema";

export async function audit(
  adminId: string,
  action: string,
  target: { type: string; id: string },
  details?: Record<string, unknown>
) {
  await db.insert(auditLogs).values({ adminId, action, targetType: target.type, targetId: target.id, details });
}
