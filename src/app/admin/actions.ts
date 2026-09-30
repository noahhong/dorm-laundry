"use server";

import { and, count, eq, gte, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { checkPassword, endAdminSession, requireAdmin, startAdminSession } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { buildings, loginFailures, machines, reports, rooms } from "@/lib/db/schema";
import { ipHash } from "@/lib/device";
import { machineCode, randomId, slugify } from "@/lib/ids";

export type FormState = { error?: string; ok?: string } | undefined;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function refresh() {
  // Admin edits can affect any public page; they are rare, so revalidate everything.
  revalidatePath("/", "layout");
}

const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_MAX_FAILURES = 5;

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  // Throttle per (salted) client IP in the database, so it holds across serverless instances and one
  // attacker can't lock everyone else out the way a global counter would.
  const db = getDb();
  const ip = await ipHash();
  const since = Date.now() - LOGIN_WINDOW_MS;
  const [{ n }] = await db.select({ n: count() }).from(loginFailures).where(and(eq(loginFailures.ipHash, ip), gte(loginFailures.createdAt, since)));
  if (n >= LOGIN_MAX_FAILURES) return { error: "Too many wrong passwords. Try again in 15 minutes." };
  if (!checkPassword(str(fd, "password"))) {
    await db.insert(loginFailures).values({ id: randomId(), ipHash: ip, createdAt: Date.now() });
    return { error: "Wrong password." };
  }
  await startAdminSession();
  redirect("/admin");
}

export async function logout() {
  await endAdminSession();
  redirect("/");
}

export async function createBuilding(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const name = str(fd, "name");
  if (!name) return { error: "Name is required." };
  const slug = slugify(str(fd, "slug") || name);
  const db = getDb();
  const [dupe] = await db.select().from(buildings).where(eq(buildings.slug, slug));
  if (dupe) return { error: `A building with the URL "${slug}" already exists.` };
  await db.insert(buildings).values({ id: randomId(), slug, name, campus: str(fd, "campus") || null, createdAt: Date.now() });
  refresh();
  return { ok: `Added ${name}.` };
}

export async function createRoom(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const buildingId = str(fd, "buildingId");
  const name = str(fd, "name");
  if (!buildingId || !name) return { error: "Building and name are required." };
  const slug = slugify(str(fd, "slug") || name);
  const db = getDb();
  const [dupe] = await db.select().from(rooms).where(and(eq(rooms.buildingId, buildingId), eq(rooms.slug, slug)));
  if (dupe) return { error: `This building already has a room at "${slug}".` };
  const id = randomId();
  await db.insert(rooms).values({
    id,
    buildingId,
    slug,
    name,
    locationHint: str(fd, "locationHint") || null,
    washLocationCode: str(fd, "washLocationCode") || null,
    createdAt: Date.now(),
  });
  refresh();
  redirect(`/admin/rooms/${id}`);
}

const addMachinesSchema = z.object({
  roomId: z.string().min(1),
  kind: z.enum(["washer", "dryer"]),
  prefix: z.string().trim().max(24),
  from: z.coerce.number().int().min(0).max(999),
  to: z.coerce.number().int().min(0).max(999),
});

export async function addMachines(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = addMachinesSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "Check the numbers." };
  const { roomId, kind, from, to } = parsed.data;
  const prefix = parsed.data.prefix || (kind === "dryer" ? "Dryer" : "Washer");
  if (to < from || to - from >= 40) return { error: "Use a range of 1–40 machines." };
  const db = getDb();
  const [{ pos }] = await db.select({ pos: max(machines.position) }).from(machines).where(eq(machines.roomId, roomId));
  let position = (pos ?? 0) + 1;
  const now = Date.now();
  const rows = [];
  for (let n = from; n <= to; n++) {
    rows.push({ id: randomId(), roomId, code: machineCode(), kind, label: `${prefix} ${n}`.trim(), position: position++, createdAt: now });
  }
  await db.insert(machines).values(rows);
  refresh();
  return { ok: `Added ${rows.length} ${kind}${rows.length === 1 ? "" : "s"}.` };
}

async function machineAction(fd: FormData, patch: Partial<typeof machines.$inferInsert>) {
  await requireAdmin();
  const id = str(fd, "machineId");
  if (!id) return;
  await getDb().update(machines).set(patch).where(eq(machines.id, id));
  refresh();
}

export async function updateMachine(fd: FormData) {
  const label = str(fd, "label");
  if (!label) return;
  await machineAction(fd, { label, washMachineNumber: str(fd, "washMachineNumber") || null, position: Number(fd.get("position")) || 0 });
}

export async function setOutOfOrder(fd: FormData) {
  await machineAction(fd, { adminState: "out_of_order", adminNote: str(fd, "note") || null });
}

/** Clears the override and ignores older reports for status (PLAN.md §6.1). */
export async function markFixed(fd: FormData) {
  await machineAction(fd, { adminState: null, adminNote: null, statusResetAt: Date.now() });
}

export async function clearOutOfOrder(fd: FormData) {
  await machineAction(fd, { adminState: null, adminNote: null });
}

export async function retireMachine(fd: FormData) {
  await machineAction(fd, { retiredAt: Date.now() });
}

export async function restoreMachine(fd: FormData) {
  await machineAction(fd, { retiredAt: null });
}

export async function setReportHidden(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "reportId");
  const hide = str(fd, "hide") === "1";
  await getDb().update(reports).set({ hiddenAt: hide ? Date.now() : null }).where(eq(reports.id, id));
  refresh();
}
