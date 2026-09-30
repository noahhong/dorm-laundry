import "server-only";
import { count, eq, lt } from "drizzle-orm";
import webpush from "web-push";
import { getDb } from "./db";
import { pushSubscriptions } from "./db/schema";
import { fixedPayload, isFixed, WATCH_TTL_MS } from "./push-rules";
import { machineStatusById } from "./queries";

/** Web Push is on when both VAPID keys are set (`npx web-push generate-vapid-keys`). */
export function pushPublicKey(): string | undefined {
  const pub = process.env.VAPID_PUBLIC_KEY;
  return pub && process.env.VAPID_PRIVATE_KEY ? pub : undefined;
}

/** Push services want a contact: VAPID_SUBJECT, else the site's https origin. */
function vapidSubject(): string {
  const s = process.env.VAPID_SUBJECT || process.env.PUBLIC_BASE_URL || "";
  return /^(mailto:|https:\/\/)/.test(s) ? s : "mailto:admin@example.com";
}

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
  const publicKey = pushPublicKey();
  if (!publicKey) return 0;
  try {
    const db = getDb();
    if ((await watcherCount(machineId)) === 0) return 0;
    const info = await machineStatusById(machineId);
    if (!info || info.machine.retiredAt) return 0;
    if (!force && !isFixed(info.status.level)) return 0;

    // Claim the rows by deleting them, so two overlapping calls can't both send.
    const claimed = await db.delete(pushSubscriptions).where(eq(pushSubscriptions.machineId, machineId)).returning();
    const payload = JSON.stringify(fixedPayload({ code: info.machine.code, label: info.machine.label, roomName: info.roomName }, force ? "admin" : "reports"));
    const vapidDetails = { subject: vapidSubject(), publicKey, privateKey: process.env.VAPID_PRIVATE_KEY! };
    const results = await Promise.allSettled(
      claimed.map((s) =>
        webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          vapidDetails,
          TTL: 24 * 3600,
          urgency: "normal",
          timeout: 10_000,
        }),
      ),
    );
    const failed = results.filter((r) => r.status === "rejected");
    // 404/410 just mean the browser dropped the subscription; anything else is worth a log line.
    for (const f of failed) {
      const code = (f.reason as { statusCode?: number })?.statusCode;
      if (code !== 404 && code !== 410) console.error("web push failed", code ?? f.reason);
    }
    return results.length - failed.length;
  } catch (e) {
    console.error("notifyIfFixed failed", e);
    return 0;
  }
}

