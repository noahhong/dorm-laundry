import "server-only";
import { getDb } from "./db";
import { auditLog } from "./db/schema";
import { randomId } from "./ids";

/** Record an admin action. Never throws: a logging failure must not block the action itself. */
export async function audit(action: string, target: string | null, detail: Record<string, unknown> | null = null) {
  try {
    await getDb().insert(auditLog).values({ id: randomId(), at: Date.now(), action, target, detail });
  } catch (e) {
    console.error("audit log write failed", e);
  }
}
