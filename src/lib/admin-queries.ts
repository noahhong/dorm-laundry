import "server-only";
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, max, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "./db";
import { auditLog, buildings, machines, pushSubscriptions, reportFlags, reportPhotos, reports, rooms } from "./db/schema";
import { flagReasons } from "./flags";
import { getConfig } from "./config-server";
import { listBuildingsWithRooms, machinesForRoom } from "./queries";
import { SYMPTOM_LABEL } from "./labels";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type Attention = {
  machineId: string;
  code: string;
  label: string;
  kind: "washer" | "dryer";
  roomId: string;
  roomName: string;
  buildingName: string;
  /** Higher sorts first. */
  severity: number;
  tags: { tone: "broken" | "caution" | "unknown"; text: string }[];
  lastReportAt: number | null;
};

export async function getDashboard(now = Date.now()) {
  const db = getDb();
  const config = await getConfig();
  const buildingsWithRooms = await listBuildingsWithRooms();

  const rooms = await Promise.all(
    buildingsWithRooms.flatMap((b) =>
      b.rooms.map(async (room) => {
        const ms = await machinesForRoom(room, now, {}, config);
        return { room, building: b, machines: ms };
      }),
    ),
  );

  // Report activity over the last 30 days (one query; bucketed in JS).
  const since = now - 30 * DAY;
  const recent = await db
    .select({ at: reports.createdAt, outcome: reports.outcome, symptoms: reports.symptoms, hiddenAt: reports.hiddenAt, machineId: reports.machineId })
    .from(reports)
    .where(and(gte(reports.createdAt, since), isNull(reports.undoneAt)));

  const inLast = (ms: number, offset = 0) => recent.filter((r) => r.at >= now - ms - offset && r.at < now - offset && !r.hiddenAt).length;
  const today = inLast(DAY);
  const yesterday = inLast(DAY, DAY);
  const week = inLast(7 * DAY);
  const prevWeek = inLast(7 * DAY, 7 * DAY);

  const days: { label: string; count: number; start: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const start = now - (i + 1) * DAY;
    const end = now - i * DAY;
    days.push({
      label: new Date(end).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      count: recent.filter((r) => r.at >= start && r.at < end && !r.hiddenAt).length,
      start,
    });
  }

  const symptomCounts = new Map<string, number>();
  for (const r of recent) {
    if (r.hiddenAt || r.outcome !== "not_working") continue;
    for (const s of r.symptoms ?? []) symptomCounts.set(s, (symptomCounts.get(s) ?? 0) + 1);
  }
  const topProblems = [...symptomCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([key, n]) => ({ key, label: SYMPTOM_LABEL[key] ?? key, count: n }));

  const outcomeCounts = new Map<string, number>();
  for (const r of recent) if (!r.hiddenAt) outcomeCounts.set(r.outcome, (outcomeCounts.get(r.outcome) ?? 0) + 1);

  const lastByRoom = new Map(
    (
      await db
        .select({ roomId: machines.roomId, at: max(reports.createdAt) })
        .from(reports)
        .innerJoin(machines, eq(reports.machineId, machines.id))
        .where(and(isNull(reports.hiddenAt), isNull(reports.undoneAt)))
        .groupBy(machines.roomId)
    ).map((r) => [r.roomId, r.at as number | null]),
  );

  const attention: Attention[] = [];
  const totals = { machines: 0, works: 0, caution: 0, broken: 0, unknown: 0, weak: 0 };
  for (const { room, building, machines: ms } of rooms) {
    for (const m of ms) {
      totals.machines++;
      totals[m.status.level]++;
      if (m.weak) totals.weak++;
      const tags: Attention["tags"] = [];
      let severity = 0;
      if (m.status.level === "broken") {
        tags.push({ tone: "broken", text: m.adminState ? `Out of order${m.adminNote ? `: ${m.adminNote}` : ""}` : `Broken: ${m.status.reason ?? "reported"}` });
        severity = 100;
      } else if (m.status.level === "caution") {
        tags.push({ tone: "caution", text: m.status.reason ?? "Caution" });
        severity = 60;
      }
      if (m.weak) {
        tags.push({ tone: "caution", text: "Dries worse than room-mates" });
        severity = Math.max(severity, 70);
      }
      const last = m.status.lastReportAt;
      if (m.status.level === "unknown" && (last === null || now - last > 14 * DAY)) {
        tags.push({ tone: "unknown", text: last === null ? "Never reported" : "No reports in 14+ days" });
        severity = Math.max(severity, 20);
      }
      if (tags.length)
        attention.push({ machineId: m.id, code: m.code, label: m.label, kind: m.kind, roomId: room.id, roomName: room.name, buildingName: building.name, severity, tags, lastReportAt: last });
    }
  }
  attention.sort((a, b) => b.severity - a.severity || a.label.localeCompare(b.label));

  const audit = await db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(8);
  const [{ n: flagged }] = await db.select({ n: count() }).from(reports).where(and(hasOpenFlags, isNull(reports.undoneAt)));

  return {
    now,
    config,
    flagged,
    totals,
    today,
    yesterday,
    week,
    prevWeek,
    days,
    topProblems,
    outcomeCounts,
    rooms: rooms.map(({ room, building, machines: ms }) => ({
      id: room.id,
      name: room.name,
      building: building.name,
      machines: ms.length,
      works: ms.filter((m) => m.status.level === "works").length,
      caution: ms.filter((m) => m.status.level === "caution").length,
      broken: ms.filter((m) => m.status.level === "broken").length,
      unknown: ms.filter((m) => m.status.level === "unknown").length,
      lastReportAt: lastByRoom.get(room.id) ?? null,
    })),
    attention,
    audit,
  };
}

// ─────────────────────────── Report moderation ───────────────────────────

export const REPORT_RANGES = { "24h": DAY, "7d": 7 * DAY, "30d": 30 * DAY, "90d": 90 * DAY, all: 0 } as const;
export type ReportRange = keyof typeof REPORT_RANGES;
export type ReportState = "visible" | "flagged" | "hidden" | "undone" | "all";

/** A resident flagged it since an admin last hid or kept it (PLAN.md §19). */
const hasOpenFlags = sql`exists(select 1 from ${reportFlags} where ${reportFlags.reportId} = ${reports.id} and ${reportFlags.createdAt} > coalesce(${reports.flagsClearedAt}, 0))`;

export interface ReportFilters {
  q?: string;
  roomId?: string;
  kind?: "washer" | "dryer";
  outcome?: string;
  state?: ReportState;
  range?: ReportRange;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function reportWhere(f: ReportFilters, now: number): SQL | undefined {
  const c: (SQL | undefined)[] = [];
  const state = f.state ?? "visible";
  if (state === "visible") c.push(isNull(reports.hiddenAt), isNull(reports.undoneAt));
  else if (state === "flagged") c.push(hasOpenFlags, isNull(reports.undoneAt));
  else if (state === "hidden") c.push(isNotNull(reports.hiddenAt));
  else if (state === "undone") c.push(isNotNull(reports.undoneAt));
  // The flagged queue is short and must be complete, so it ignores the period.
  const range = state === "flagged" ? 0 : REPORT_RANGES[f.range ?? "30d"];
  if (range) c.push(gte(reports.createdAt, now - range));
  if (f.roomId) c.push(eq(machines.roomId, f.roomId));
  if (f.kind) c.push(eq(machines.kind, f.kind));
  if (f.outcome) c.push(eq(reports.outcome, f.outcome));
  const q = f.q?.trim().slice(0, 80);
  if (q) {
    const pat = `%${escapeLike(q)}%`;
    c.push(or(sql`${reports.note} LIKE ${pat} ESCAPE '\\'`, sql`${reports.errorCode} LIKE ${pat} ESCAPE '\\'`, sql`${machines.label} LIKE ${pat} ESCAPE '\\'`));
  }
  return and(...c);
}

const reportSelect = {
  report: reports,
  machineLabel: machines.label,
  machineCode: machines.code,
  kind: machines.kind,
  roomId: rooms.id,
  roomName: rooms.name,
  buildingName: buildings.name,
  hasPhoto: sql<number>`exists(select 1 from ${reportPhotos} where ${reportPhotos.reportId} = ${reports.id})`,
};

export async function listReports(f: ReportFilters, page: number, pageSize = 25, now = Date.now()) {
  const db = getDb();
  const where = reportWhere(f, now);
  const base = db
    .select(reportSelect)
    .from(reports)
    .innerJoin(machines, eq(reports.machineId, machines.id))
    .innerJoin(rooms, eq(machines.roomId, rooms.id))
    .innerJoin(buildings, eq(rooms.buildingId, buildings.id))
    .where(where);
  const [{ n }] = await db
    .select({ n: count() })
    .from(reports)
    .innerJoin(machines, eq(reports.machineId, machines.id))
    .where(where);
  const page_ = await base.orderBy(desc(reports.createdAt)).limit(pageSize).offset(Math.max(0, page - 1) * pageSize);
  // Open flags per report on this page, as reason counts.
  const flags = page_.length
    ? await db
        .select({ reportId: reportFlags.reportId, reason: reportFlags.reason, createdAt: reportFlags.createdAt })
        .from(reportFlags)
        .innerJoin(reports, eq(reportFlags.reportId, reports.id))
        .where(and(inArray(reportFlags.reportId, page_.map((r) => r.report.id)), sql`${reportFlags.createdAt} > coalesce(${reports.flagsClearedAt}, 0)`))
    : [];
  const rows = page_.map((r) => ({ ...r, flags: flagReasons(flags.filter((f) => f.reportId === r.report.id)) }));
  return { rows, total: n, pageSize, pages: Math.max(1, Math.ceil(n / pageSize)), now };
}

export async function exportReports(f: ReportFilters, now = Date.now()) {
  return getDb()
    .select(reportSelect)
    .from(reports)
    .innerJoin(machines, eq(reports.machineId, machines.id))
    .innerJoin(rooms, eq(machines.roomId, rooms.id))
    .innerJoin(buildings, eq(rooms.buildingId, buildings.id))
    .where(reportWhere(f, now))
    .orderBy(desc(reports.createdAt))
    .limit(20000);
}

// ─────────────────────────── Audit log ───────────────────────────

export async function listAudit(page: number, pageSize = 30) {
  const db = getDb();
  const [{ n }] = await db.select({ n: count() }).from(auditLog);
  const rows = await db
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.at))
    .limit(pageSize)
    .offset(Math.max(0, page - 1) * pageSize);
  return { rows, total: n, pages: Math.max(1, Math.ceil(n / pageSize)), now: Date.now() };
}

export async function listAllRooms() {
  return getDb()
    .select({ id: rooms.id, name: rooms.name, building: buildings.name })
    .from(rooms)
    .innerJoin(buildings, eq(rooms.buildingId, buildings.id))
    .orderBy(buildings.name, rooms.name);
}

/** How many browsers are waiting to hear each machine in a room is fixed (PLAN.md §17). */
export async function watchersByMachine(roomId: string): Promise<Map<string, number>> {
  const rows = await getDb()
    .select({ machineId: pushSubscriptions.machineId, n: count() })
    .from(pushSubscriptions)
    .innerJoin(machines, eq(pushSubscriptions.machineId, machines.id))
    .where(eq(machines.roomId, roomId))
    .groupBy(pushSubscriptions.machineId);
  return new Map(rows.map((r) => [r.machineId, r.n]));
}
