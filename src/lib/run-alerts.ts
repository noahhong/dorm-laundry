// Sends "your laundry should be done" pushes when an "I started it" timer runs out (PLAN.md §18).
// Started from src/instrumentation.ts, so it avoids "server-only" modules (queries.ts, push.ts).
import { and, eq, isNotNull, lte, or } from "drizzle-orm";
import { getDb } from "./db";
import { machineRuns, machines, rooms } from "./db/schema";
import { doneAlertAction, donePayload, DONE_SWEEP_MS } from "./push-rules";
import { pushPublicKey, sendPushes } from "./push-send";

/** Send every alert that is due and forget the subscriptions of runs that are due or ended. Returns how many were sent. */
export async function sendDueRunAlerts(now = Date.now()): Promise<number> {
  if (!pushPublicKey()) return 0;
  const db = getDb();
  const rows = await db
    .select({
      id: machineRuns.id,
      endsAt: machineRuns.endsAt,
      endedAt: machineRuns.endedAt,
      endpoint: machineRuns.alertEndpoint,
      p256dh: machineRuns.alertP256dh,
      auth: machineRuns.alertAuth,
      code: machines.code,
      label: machines.label,
      kind: machines.kind,
      roomName: rooms.name,
    })
    .from(machineRuns)
    .innerJoin(machines, eq(machineRuns.machineId, machines.id))
    .innerJoin(rooms, eq(machines.roomId, rooms.id))
    .where(and(isNotNull(machineRuns.alertEndpoint), or(lte(machineRuns.endsAt, now), isNotNull(machineRuns.endedAt))));

  let sent = 0;
  for (const r of rows) {
    const action = doneAlertAction(r, now);
    if (action === "wait" || !r.endpoint || !r.p256dh || !r.auth) continue;
    // Claim the alert by clearing it, so two overlapping sweeps can't both send.
    const claimed = await db
      .update(machineRuns)
      .set({ alertEndpoint: null, alertP256dh: null, alertAuth: null })
      .where(and(eq(machineRuns.id, r.id), eq(machineRuns.alertEndpoint, r.endpoint)))
      .returning({ id: machineRuns.id });
    if (claimed.length === 0 || action === "drop") continue;
    // Short TTL: "your load is done" is useless hours later.
    sent += await sendPushes([{ endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth }], donePayload(r), 30 * 60);
  }
  return sent;
}

const globalForSweep = globalThis as unknown as { __dlDoneSweep?: ReturnType<typeof setInterval> };

/**
 * Check for finished timers every DONE_SWEEP_MS while the server runs. Fine for a long-running `next start` or
 * `next dev`; a serverless host would need a cron calling sendDueRunAlerts instead.
 */
export function startRunAlertSweep() {
  if (!pushPublicKey() || globalForSweep.__dlDoneSweep) return;
  let busy = false;
  globalForSweep.__dlDoneSweep = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      await sendDueRunAlerts();
    } catch (e) {
      console.error("done alerts failed", e);
    } finally {
      busy = false;
    }
  }, DONE_SWEEP_MS);
  globalForSweep.__dlDoneSweep.unref?.();
}
