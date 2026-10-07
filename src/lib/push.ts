import "server-only";
import { count, eq, lt } from "drizzle-orm";
import { getDb } from "./db";
import { pushSubscriptions } from "./db/schema";
import { fixedPayload, isFixed, WATCH_TTL_MS } from "./push-rules";
import { pushPublicKey, sendPushes } from "./push-send";
import { machineStatusById } from "./queries";

export { pushPublicKey };

export async function watcherCount(machineId: string): Promise<number> {
  const [{ n }] = await getDb().select({ n: count() }).from(pushSubscriptions).where(eq(pushSubscriptions.machineId, machineId));
  return n;
}

export async function pruneExpiredWatches(now = Date.now()) {
  await getDb().delete(pushSubscriptions).where(lt(pushSubscriptions.createdAt, now - WATCH_TTL_MS));
}

/**
 * Tell everyone watching this machine that it works again, then forget them (one notification per watch).
 * `force`: an admin marked it fixed, so don't second-guess with the report-based status. Never throws.
 */
export async function notifyIfFixed(machineId: string, { force = false }: { force?: boolean } = {}): Promise<number> {
  if (!pushPublicKey()) return 0;
  try {
    const db = getDb();
    if ((await watcherCount(machineId)) === 0) return 0;
    const info = await machineStatusById(machineId);
    if (!info || info.machine.retiredAt) return 0;
    if (!force && !isFixed(info.status.level)) return 0;

    // Claim the rows by deleting them, so two overlapping calls can't both send.
    const claimed = await db.delete(pushSubscriptions).where(eq(pushSubscriptions.machineId, machineId)).returning();
    const payload = fixedPayload({ code: info.machine.code, label: info.machine.label, roomName: info.roomName }, force ? "admin" : "reports");
    return await sendPushes(claimed, payload, 24 * 3600);
  } catch (e) {
    console.error("notifyIfFixed failed", e);
    return 0;
  }
}

