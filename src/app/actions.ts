"use server";

import { and, eq, gte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { buildings, machines, reports, rooms } from "@/lib/db/schema";
import { checkRateLimit, clientIp, deviceHash, ipHash } from "@/lib/device";
import { turnstileEnabled, verifyTurnstile } from "@/lib/turnstile";
import { randomId } from "@/lib/ids";
import { checkForKind, reportSchema, type ReportPayload } from "@/lib/validation";

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

const UNDO_WINDOW_MS = 5 * 60_000;

async function revalidateMachine(machineId: string) {
  const [row] = await getDb()
    .select({ code: machines.code, roomSlug: rooms.slug, buildingSlug: buildings.slug })
    .from(machines)
    .innerJoin(rooms, eq(machines.roomId, rooms.id))
    .innerJoin(buildings, eq(rooms.buildingId, buildings.id))
    .where(eq(machines.id, machineId));
  if (!row) return;
  revalidatePath(`/m/${row.code}`);
  revalidatePath(`/b/${row.buildingSlug}/${row.roomSlug}`);
}

export async function submitReport(payload: ReportPayload): Promise<ActionResult> {
  const parsed = reportSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Something about that report didn't look right." };
  const p = parsed.data;
  // Bots: pretend success so they don't retry, but store nothing.
  if (p.website || (p.elapsedMs !== undefined && p.elapsedMs < 800)) return { ok: true, id: "ignored" };
  if (turnstileEnabled() && !(await verifyTurnstile(p.turnstileToken, await clientIp()))) {
    return { ok: false, error: "Couldn't confirm you're human. Wait a second and try again." };
  }

  const db = getDb();
  const [machine] = await db.select().from(machines).where(eq(machines.code, p.code)).limit(1);
  if (!machine || machine.retiredAt) return { ok: false, error: "That machine isn't in our list anymore." };

  const kindError = checkForKind(machine.kind, p);
  if (kindError) return { ok: false, error: kindError };

  const now = Date.now();
  const device = (await deviceHash({ create: true }))!;
  const ip = await ipHash(now);
  const limited = await checkRateLimit(db, { device, ip, machineId: machine.id, now });
  if (limited) return { ok: false, error: limited };

  const id = randomId();
  await db.insert(reports).values({
    id,
    machineId: machine.id,
    createdAt: now,
    outcome: p.outcome,
    setting: p.setting ?? null,
    symptoms: p.outcome === "not_working" ? p.symptoms : [],
    errorCode: p.errorCode ?? null,
    minutes: p.minutes ?? null,
    loadSize: p.loadSize ?? null,
    note: p.note ?? null,
    deviceHash: device,
    ipHash: ip,
    trust: 1,
  });
  await revalidateMachine(machine.id);
  return { ok: true, id };
}

/** Let a reporter take back their own report shortly after sending it. */
export async function undoReport(id: string): Promise<ActionResult> {
  const device = await deviceHash({ create: false });
  if (!device || typeof id !== "string") return { ok: false, error: "Can't undo that report." };
  const db = getDb();
  const deleted = await db
    .delete(reports)
    .where(and(eq(reports.id, id), eq(reports.deviceHash, device), gte(reports.createdAt, Date.now() - UNDO_WINDOW_MS)))
    .returning({ machineId: reports.machineId });
  if (deleted.length === 0) return { ok: false, error: "Too late to undo that one." };
  await revalidateMachine(deleted[0].machineId);
  return { ok: true, id };
}
