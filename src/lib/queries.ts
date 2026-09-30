import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { buildings, machines, reports, rooms, type Machine, type Report, type Room } from "./db/schema";
import { getConfig } from "./config-server";
import { toParams, type Config } from "./config";
import type { DryerSetting } from "./labels";
import { offeredSettings } from "./rooms";
import { applyRoomFallback, computeStatus, detectWeakDryers, recommendSetting, type MachineStatus, type Params, type Recommendation, type WeakDryer } from "./status";

export interface MachineView {
  id: string;
  code: string;
  kind: "washer" | "dryer";
  label: string;
  washMachineNumber: string | null;
  adminState: "out_of_order" | null;
  adminNote: string | null;
  status: MachineStatus;
  recommendation: Recommendation | null;
  /** Set when this dryer dries much worse than the others in its room. */
  weak: WeakDryer | null;
}

function toView(m: Machine, rs: Report[], now: number, params: Params, offered: DryerSetting[]): MachineView {
  const input = rs.filter((r) => !r.hiddenAt);
  return {
    id: m.id,
    code: m.code,
    kind: m.kind,
    label: m.label,
    washMachineNumber: m.washMachineNumber,
    adminState: m.adminState ?? null,
    adminNote: m.adminNote,
    status: computeStatus({ kind: m.kind, adminState: m.adminState ?? null, adminNote: m.adminNote, statusResetAt: m.statusResetAt }, input, now, params),
    recommendation: m.kind === "dryer" ? recommendSetting(input, now, params, offered) : null,
    weak: null,
  };
}

async function reportsFor(machineIds: string[], now: number, windowMs: number) {
  if (machineIds.length === 0) return new Map<string, Report[]>();
  const rows = await getDb()
    .select()
    .from(reports)
    .where(and(inArray(reports.machineId, machineIds), gte(reports.createdAt, now - windowMs), isNull(reports.hiddenAt), isNull(reports.undoneAt)));
  const byMachine = new Map<string, Report[]>();
  for (const r of rows) {
    const list = byMachine.get(r.machineId) ?? [];
    list.push(r);
    byMachine.set(r.machineId, list);
  }
  return byMachine;
}

export async function listBuildingsWithRooms() {
  const db = getDb();
  const [bs, rs] = await Promise.all([
    db.select().from(buildings).orderBy(asc(buildings.name)),
    db.select().from(rooms).orderBy(asc(rooms.name)),
  ]);
  return bs.map((b) => ({ ...b, rooms: rs.filter((r) => r.buildingId === b.id) }));
}

export async function machinesForRoom(room: Room, now: number, { includeRetired = false } = {}, config?: Config) {
  const cfg = config ?? (await getConfig());
  const params = toParams(cfg);
  const offered = offeredSettings(room.dryerSettings);
  const roomId = room.id;
  const ms = await getDb()
    .select()
    .from(machines)
    .where(includeRetired ? eq(machines.roomId, roomId) : and(eq(machines.roomId, roomId), isNull(machines.retiredAt)))
    .orderBy(asc(machines.position), asc(machines.label));
  const rs = await reportsFor(
    ms.map((m) => m.id),
    now,
    params.windowMs,
  );
  const views = ms.map((m) => ({ ...toView(m, rs.get(m.id) ?? [], now, params, offered), retiredAt: m.retiredAt, position: m.position }));
  const resetAt = new Map(ms.map((m) => [m.id, m.statusResetAt ?? 0]));
  // Broken dryers are already flagged, and their wet loads would skew the room's baseline, so they sit this out.
  const weak = detectWeakDryers(
    views
      .filter((v) => v.kind === "dryer" && v.retiredAt == null && v.status.level !== "broken")
      // "Mark fixed" means earlier damp loads no longer count against the machine.
      .map((v) => ({ id: v.id, reports: (rs.get(v.id) ?? []).filter((r) => !r.hiddenAt && r.createdAt >= (resetAt.get(v.id) ?? 0)) })),
    now,
    params,
  );
  const withWeak = views.map((v) => ({ ...v, weak: weak.get(v.id) ?? null }));
  return cfg.roomFallbackEnabled ? withRoomFallback(withWeak) : withWeak;
}

/** Dryers with no setting data borrow the room's consensus (retired machines don't vote). */
function withRoomFallback<T extends MachineView & { retiredAt: number | null }>(views: T[]): T[] {
  const dryers = views.filter((v) => v.kind === "dryer" && v.recommendation && v.retiredAt == null);
  const recs = applyRoomFallback(dryers.map((d) => d.recommendation!));
  const byId = new Map(dryers.map((d, i) => [d.id, recs[i]]));
  return views.map((v) => (byId.has(v.id) ? { ...v, recommendation: byId.get(v.id)! } : v));
}

export async function getRoom(buildingSlug: string, roomSlug: string, now = Date.now()) {
  const db = getDb();
  const [row] = await db
    .select({ room: rooms, building: buildings })
    .from(rooms)
    .innerJoin(buildings, eq(rooms.buildingId, buildings.id))
    .where(and(eq(buildings.slug, buildingSlug), eq(rooms.slug, roomSlug)))
    .limit(1);
  if (!row) return null;
  const ms = await machinesForRoom(row.room, now);
  const totalReports = ms.reduce((n, m) => n + m.status.reporters, 0);
  return { ...row, machines: ms, totalReports, now };
}

export async function getRoomById(roomId: string, now = Date.now(), opts: { includeRetired?: boolean } = {}) {
  const db = getDb();
  const [row] = await db
    .select({ room: rooms, building: buildings })
    .from(rooms)
    .innerJoin(buildings, eq(rooms.buildingId, buildings.id))
    .where(eq(rooms.id, roomId))
    .limit(1);
  if (!row) return null;
  return { ...row, machines: await machinesForRoom(row.room, now, opts), offered: offeredSettings(row.room.dryerSettings), now };
}

export type PublicReport = Pick<Report, "id" | "createdAt" | "outcome" | "setting" | "symptoms" | "errorCode" | "minutes" | "loadSize" | "note">;

export async function getMachine(code: string, now = Date.now()) {
  const db = getDb();
  const [row] = await db
    .select({ machine: machines, room: rooms, building: buildings })
    .from(machines)
    .innerJoin(rooms, eq(machines.roomId, rooms.id))
    .innerJoin(buildings, eq(rooms.buildingId, buildings.id))
    .where(eq(machines.code, code))
    .limit(1);
  if (!row) return null;
  const config = await getConfig();
  const params = toParams(config);
  const offered = offeredSettings(row.room.dryerSettings);
  const rs = (await reportsFor([row.machine.id], now, params.windowMs)).get(row.machine.id) ?? [];
  let view = toView(row.machine, rs, now, params, offered);
  if (view.kind === "dryer") {
    // Room context (sibling fallback and outlier detection) only applies to dryers.
    const inRoom = (await machinesForRoom(row.room, now, { includeRetired: true }, config)).find((m) => m.id === view.id);
    if (inRoom) view = { ...view, recommendation: inRoom.recommendation, weak: inRoom.weak };
  }
  const recent: PublicReport[] = [...rs]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 20)
    .map(({ id, createdAt, outcome, setting, symptoms, errorCode, minutes, loadSize, note }) => ({
      id,
      createdAt,
      outcome,
      setting,
      symptoms,
      errorCode,
      minutes,
      loadSize,
      // Admins can keep residents' free text private (Settings → "Show report notes publicly").
      note: config.notesPublic ? note : null,
    }));
  return { ...row, view, recent, retired: row.machine.retiredAt != null, offered, config, now };
}

export async function recentReportsForRoom(roomId: string, limit = 40) {
  return getDb()
    .select({ report: reports, label: machines.label, code: machines.code })
    .from(reports)
    .innerJoin(machines, eq(reports.machineId, machines.id))
    .where(and(eq(machines.roomId, roomId), isNull(reports.undoneAt)))
    .orderBy(desc(reports.createdAt))
    .limit(limit);
}
