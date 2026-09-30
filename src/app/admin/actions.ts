"use server";

import { and, count, eq, gte, inArray, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { checkPassword, endAdminSession, requireAdmin, startAdminSession } from "@/lib/admin-auth";
import { getDb } from "@/lib/db";
import { buildings, loginFailures, machines, reports, rooms } from "@/lib/db/schema";
import { audit } from "@/lib/audit";
import { parseSettingsForm, type FormErrors } from "@/lib/config";
import { getConfig, resetConfig, saveConfig } from "@/lib/config-server";
import { ipHash } from "@/lib/device";
import { machineCode, randomId, slugify } from "@/lib/ids";
import { clearAnthropicKey, getAnthropicKey, looksLikeAnthropicKey, saveAnthropicKey } from "@/lib/api-key";
import { testAnthropicKey } from "@/lib/assistant-server";
import { notifyIfFixed } from "@/lib/push";
import { settingsToStore } from "@/lib/rooms";

export type FormState = { error?: string; ok?: string; errors?: FormErrors } | undefined;

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
  await audit("admin.login", null, null);
  redirect("/admin");
}

export async function logout() {
  await audit("admin.logout", null, null);
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
  const id = randomId();
  await db.insert(buildings).values({ id, slug, name, campus: str(fd, "campus") || null, createdAt: Date.now() });
  await audit("building.create", id, { name, slug });
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
  await audit("room.create", id, { name, slug });
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
  await audit("machine.add", roomId, { kind, labels: rows.map((r) => r.label) });
  refresh();
  return { ok: `Added ${rows.length} ${kind}${rows.length === 1 ? "" : "s"}.` };
}

async function machineAction(fd: FormData, patch: Partial<typeof machines.$inferInsert>, action: string) {
  await requireAdmin();
  const id = str(fd, "machineId");
  if (!id) return;
  await getDb().update(machines).set(patch).where(eq(machines.id, id));
  await audit(action, id, patch as Record<string, unknown>);
  refresh();
}

export async function updateMachine(fd: FormData) {
  const label = str(fd, "label");
  if (!label) return;
  await machineAction(fd, { label, washMachineNumber: str(fd, "washMachineNumber") || null, position: Number(fd.get("position")) || 0 }, "machine.update");
}

export async function setOutOfOrder(fd: FormData) {
  await machineAction(fd, { adminState: "out_of_order", adminNote: str(fd, "note") || null }, "machine.out_of_order");
}

/** Clears the override and ignores older reports for status (PLAN.md §6.1). Tells anyone waiting on it (§17). */
export async function markFixed(fd: FormData) {
  await machineAction(fd, { adminState: null, adminNote: null, statusResetAt: Date.now() }, "machine.mark_fixed");
  const id = str(fd, "machineId");
  if (id) after(() => notifyIfFixed(id, { force: true }));
}

/** Only the admin override goes; if residents' reports still say Broken, watchers keep waiting. */
export async function clearOutOfOrder(fd: FormData) {
  await machineAction(fd, { adminState: null, adminNote: null }, "machine.clear_out_of_order");
  const id = str(fd, "machineId");
  if (id) after(() => notifyIfFixed(id));
}

export async function retireMachine(fd: FormData) {
  await machineAction(fd, { retiredAt: Date.now() }, "machine.retire");
}

export async function restoreMachine(fd: FormData) {
  await machineAction(fd, { retiredAt: null }, "machine.restore");
}

export async function setReportHidden(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "reportId");
  const hide = str(fd, "hide") === "1";
  await getDb().update(reports).set({ hiddenAt: hide ? Date.now() : null }).where(eq(reports.id, id));
  await audit(hide ? "report.hide" : "report.unhide", id, null);
  refresh();
}

/** Hide (or unhide) every report ticked on the moderation page. */
export async function bulkSetReportsHidden(fd: FormData) {
  await requireAdmin();
  const ids = fd.getAll("reportId").map(String).filter(Boolean).slice(0, 500);
  if (ids.length === 0) return;
  const hide = str(fd, "hide") === "1";
  await getDb().update(reports).set({ hiddenAt: hide ? Date.now() : null }).where(inArray(reports.id, ids));
  await audit(hide ? "report.bulk_hide" : "report.bulk_unhide", null, { count: ids.length });
  refresh();
}

export async function updateBuilding(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const id = str(fd, "buildingId");
  const name = str(fd, "name");
  if (!id || !name) return { error: "Name is required." };
  await getDb().update(buildings).set({ name, campus: str(fd, "campus") || null }).where(eq(buildings.id, id));
  await audit("building.update", id, { name });
  refresh();
  return { ok: "Saved." };
}

/** Deleting cascades to rooms, machines and reports, so the admin must retype the name. */
export async function deleteBuilding(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const id = str(fd, "buildingId");
  const db = getDb();
  const [b] = await db.select().from(buildings).where(eq(buildings.id, id));
  if (!b) return { error: "Building not found." };
  if (str(fd, "confirm") !== b.name) return { error: `Type “${b.name}” exactly to confirm.` };
  await db.delete(buildings).where(eq(buildings.id, id));
  await audit("building.delete", id, { name: b.name });
  refresh();
  redirect("/admin/rooms");
}

const roomSchema = z.object({
  roomId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required.").max(60),
  locationHint: z.string().trim().max(120),
  washLocationCode: z.string().trim().max(20),
  minutesPerCycle: z.union([z.literal(""), z.coerce.number().int().min(1).max(240)]),
});

export async function updateRoom(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = roomSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the fields." };
  const picked = settingsToStore(fd.getAll("dryerSetting").map(String));
  if (picked === "empty") return { error: "Pick at least one dryer setting." };
  const p = parsed.data;
  await getDb()
    .update(rooms)
    .set({
      name: p.name,
      locationHint: p.locationHint || null,
      washLocationCode: p.washLocationCode || null,
      minutesPerCycle: p.minutesPerCycle === "" ? null : p.minutesPerCycle,
      dryerSettings: picked,
    })
    .where(eq(rooms.id, p.roomId));
  await audit("room.update", p.roomId, { name: p.name, dryerSettings: picked ?? "all", minutesPerCycle: p.minutesPerCycle || null });
  refresh();
  return { ok: "Room saved." };
}

export async function deleteRoom(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const id = str(fd, "roomId");
  const db = getDb();
  const [r] = await db.select().from(rooms).where(eq(rooms.id, id));
  if (!r) return { error: "Room not found." };
  if (str(fd, "confirm") !== r.name) return { error: `Type “${r.name}” exactly to confirm.` };
  await db.delete(rooms).where(eq(rooms.id, id));
  await audit("room.delete", id, { name: r.name });
  refresh();
  redirect("/admin/rooms");
}

export async function saveSettings(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const { values, errors } = parseSettingsForm(fd);
  if (Object.keys(errors).length > 0) return { error: "Some values need fixing.", errors };
  const changed = await saveConfig(values, await getConfig());
  refresh();
  return { ok: changed.length ? `Saved ${changed.length} change${changed.length === 1 ? "" : "s"}. Live now.` : "Nothing changed." };
}

export async function resetSettings(): Promise<FormState> {
  await requireAdmin();
  await resetConfig();
  refresh();
  return { ok: "Everything is back to the defaults." };
}

/** Laundry helper API key: checked with Anthropic before saving, stored encrypted, never sent back to the browser. */
export async function saveApiKey(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const key = str(fd, "apiKey");
  if (!looksLikeAnthropicKey(key)) return { error: "That doesn't look like an Anthropic API key. It starts with sk-ant-." };
  const problem = await testAnthropicKey(key);
  if (problem) return { error: `${problem} Nothing was saved.` };
  await saveAnthropicKey(key);
  refresh();
  return { ok: "Key saved and working. The laundry helper is live." };
}

export async function removeApiKey(): Promise<FormState> {
  await requireAdmin();
  await clearAnthropicKey();
  refresh();
  return { ok: "Key removed." };
}

export async function testApiKey(): Promise<FormState> {
  await requireAdmin();
  const { key } = await getAnthropicKey();
  if (!key) return { error: "No key to test yet." };
  const problem = await testAnthropicKey(key);
  return problem ? { error: problem } : { ok: "The key works." };
}

/** Per-row Hide/Unhide on the moderation page: flips whatever the report's current state is. */
export async function toggleReportHidden(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "toggle");
  if (!id) return;
  const db = getDb();
  const [r] = await db.select({ hiddenAt: reports.hiddenAt }).from(reports).where(eq(reports.id, id));
  if (!r) return;
  await db.update(reports).set({ hiddenAt: r.hiddenAt ? null : Date.now() }).where(eq(reports.id, id));
  await audit(r.hiddenAt ? "report.unhide" : "report.hide", id, null);
  refresh();
}
