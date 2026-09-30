"use server";

import { and, count, eq, gt, gte, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { buildings, machineRuns, machines, reports, rooms } from "@/lib/db/schema";
import { getConfig } from "@/lib/config-server";
import { checkRateLimit, clientIp, deviceHash, ipHash } from "@/lib/device";
import { offeredSettings } from "@/lib/rooms";
import { turnstileEnabled, verifyTurnstile } from "@/lib/turnstile";
import { randomId } from "@/lib/ids";
import { checkForKind, reportSchema, runSchema, type ReportPayload, type RunPayload } from "@/lib/validation";

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };


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
  const config = await getConfig();
  if (p.website || p.elapsedMs < config.minElapsedMs) return { ok: true, id: "ignored" };
  if (turnstileEnabled() && !(await verifyTurnstile(p.turnstileToken, await clientIp()))) {
    return { ok: false, error: "Couldn't confirm you're human. Wait a second and try again." };
  }

  const db = getDb();
  const [machine] = await db.select().from(machines).where(eq(machines.code, p.code)).limit(1);
  if (!machine || machine.retiredAt) return { ok: false, error: "That machine isn't in our list anymore." };

  const [room] = await db.select({ dryerSettings: rooms.dryerSettings }).from(rooms).where(eq(rooms.id, machine.roomId)).limit(1);
  const kindError = checkForKind(machine.kind, p, offeredSettings(room?.dryerSettings));
  if (kindError) return { ok: false, error: kindError };

  const now = Date.now();
  const device = (await deviceHash({ create: true }))!;
  const ip = await ipHash(now);
  const limited = await checkRateLimit(
    db,
    { device, ip, machineId: machine.id, now },
    { perMachineMs: config.rateMachineMinutes * 60_000, perDevicePerDay: config.rateDevicePerDay, perIpPerDay: config.rateIpPerDay },
  );
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
  // Reporting how it went means this device's load is out, so its "I started it" timer is done.
  await db
    .update(machineRuns)
    .set({ endedAt: now })
    .where(and(eq(machineRuns.machineId, machine.id), eq(machineRuns.deviceHash, device), isNull(machineRuns.endedAt), gt(machineRuns.endsAt, now - 24 * 3_600_000)));
  await revalidateMachine(machine.id);
  return { ok: true, id };
}

/** Let a reporter take back their own report shortly after sending it. */
export async function undoReport(id: string): Promise<ActionResult> {
  const device = await deviceHash({ create: false });
  if (!device || typeof id !== "string") return { ok: false, error: "Can't undo that report." };
  const db = getDb();
  // Soft-delete: the row still counts toward rate limits, so report → undo → report can't reset them.
  const deleted = await db
    .update(reports)
    .set({ undoneAt: Date.now() })
    .where(and(eq(reports.id, id), eq(reports.deviceHash, device), isNull(reports.undoneAt), gte(reports.createdAt, Date.now() - (await getConfig()).undoWindowMinutes * 60_000)))
    .returning({ machineId: reports.machineId });
  if (deleted.length === 0) return { ok: false, error: "Too late to undo that one." };
  await revalidateMachine(deleted[0].machineId);
  return { ok: true, id };
}

/** "I started it": mark a machine as running so others can see roughly when it will be free. */
export async function startRun(payload: RunPayload): Promise<ActionResult> {
  const parsed = runSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Pick how many minutes it will run (5 to 120)." };
  const { code, minutes } = parsed.data;
  const db = getDb();
  const [machine] = await db.select().from(machines).where(eq(machines.code, code)).limit(1);
  if (!machine || machine.retiredAt) return { ok: false, error: "That machine isn't in our list anymore." };
  if (machine.adminState === "out_of_order") return { ok: false, error: "This machine is marked out of order." };

  const config = await getConfig();
  const now = Date.now();
  const device = (await deviceHash({ create: true }))!;
  const ip = await ipHash(now);
  // Same daily caps as reports, counted separately so starting a machine never eats into your reports.
  const dayAgo = now - 24 * 3_600_000;
  const [byDevice] = await db.select({ n: count() }).from(machineRuns).where(and(eq(machineRuns.deviceHash, device), gte(machineRuns.startedAt, dayAgo)));
  if (byDevice.n >= config.rateDevicePerDay) return { ok: false, error: "That's a lot of machines today. Try again tomorrow." };
  const [byIp] = await db.select({ n: count() }).from(machineRuns).where(and(eq(machineRuns.ipHash, ip), gte(machineRuns.startedAt, dayAgo)));
  if (byIp.n >= config.rateIpPerDay) return { ok: false, error: "Too many timers from this network today." };

  // The newest run is the one that shows; close out older open ones so the history stays tidy.
  await db.update(machineRuns).set({ endedAt: now }).where(and(eq(machineRuns.machineId, machine.id), isNull(machineRuns.endedAt)));
  const id = randomId();
  await db.insert(machineRuns).values({ id, machineId: machine.id, startedAt: now, endsAt: now + minutes * 60_000, deviceHash: device, ipHash: ip });
  await revalidateMachine(machine.id);
  return { ok: true, id };
}

/** The starter takes their timer back (wrong machine, or the load finished early). */
export async function endRun(id: string): Promise<ActionResult> {
  const device = await deviceHash({ create: false });
  if (!device || typeof id !== "string") return { ok: false, error: "Can't stop that timer." };
  const ended = await getDb()
    .update(machineRuns)
    .set({ endedAt: Date.now() })
    .where(and(eq(machineRuns.id, id), eq(machineRuns.deviceHash, device), isNull(machineRuns.endedAt)))
    .returning({ machineId: machineRuns.machineId });
  if (ended.length === 0) return { ok: false, error: "That timer already ended." };
  await revalidateMachine(ended[0].machineId);
  return { ok: true, id };
}
