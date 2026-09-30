import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { buildings, machines, reports, rooms, type Machine, type Report } from "./db/schema";
import { applyRoomFallback, computeStatus, recommendSetting, WINDOW, type MachineStatus, type Recommendation } from "./status";

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
}

function toView(m: Machine, rs: Report[], now: number): MachineView {
  const input = rs.filter((r) => !r.hiddenAt);
  return {
    id: m.id,
    code: m.code,
    kind: m.kind,
    label: m.label,
    washMachineNumber: m.washMachineNumber,
    adminState: m.adminState ?? null,
    adminNote: m.adminNote,
    status: computeStatus({ kind: m.kind, adminState: m.adminState ?? null, adminNote: m.adminNote, statusResetAt: m.statusResetAt }, input, now),
    recommendation: m.kind === "dryer" ? recommendSetting(input, now) : null,
  };
}

async function reportsFor(machineIds: string[], now: number) {
  if (machineIds.length === 0) return new Map<string, Report[]>();
  const rows = await getDb()
    .select()
    .from(reports)
    .where(and(inArray(reports.machineId, machineIds), gte(reports.createdAt, now - WINDOW), isNull(reports.hiddenAt)));
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

async function machinesForRoom(roomId: string, now: number, { includeRetired = false } = {}) {
  const ms = await getDb()
    .select()
    .from(machines)
    .where(includeRetired ? eq(machines.roomId, roomId) : and(eq(machines.roomId, roomId), isNull(machines.retiredAt)))
    .orderBy(asc(machines.position), asc(machines.label));
  const rs = await reportsFor(
    ms.map((m) => m.id),
    now,
  );
  const views = ms.map((m) => ({ ...toView(m, rs.get(m.id) ?? [], now), retiredAt: m.retiredAt, position: m.position }));
  return withRoomFallback(views);
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
  const ms = await machinesForRoom(row.room.id, now);
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
  return { ...row, machines: await machinesForRoom(row.room.id, now, opts), now };
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
  const rs = (await reportsFor([row.machine.id], now)).get(row.machine.id) ?? [];
  let view = toView(row.machine, rs, now);
  if (view.recommendation?.basis === "default") {
    const siblings = await machinesForRoom(row.room.id, now);
    view = { ...view, recommendation: siblings.find((m) => m.id === view.id)?.recommendation ?? view.recommendation };
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
      note,
    }));
  return { ...row, view, recent, retired: row.machine.retiredAt != null, now };
}

export async function recentReportsForRoom(roomId: string, limit = 40) {
  return getDb()
    .select({ report: reports, label: machines.label, code: machines.code })
    .from(reports)
    .innerJoin(machines, eq(reports.machineId, machines.id))
    .where(eq(machines.roomId, roomId))
    .orderBy(desc(reports.createdAt))
    .limit(limit);
}
