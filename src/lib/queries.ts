import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { buildings, machineRuns, machines, reportFlags, reportPhotos, reports, reportVotes, rooms, type Machine, type MachineRun, type Report, type Room } from "./db/schema";
import { busyWeek, type BusyWeek } from "./busy";
import { deviceHash } from "./device";
import { getConfig } from "./config-server";
import { toLearnParams, toParams, type Config } from "./config";
import { learnFabricOutcomes, type Learned } from "./load-advice";
import type { DryerSetting } from "./labels";
import { offeredSettings } from "./rooms";
import { applyRoomFallback, computeStatus, currentRun, defaultRunMinutes, detectWeakDryers, recommendSetting, votedTrust, type InUse, type MachineStatus, type Params, type Recommendation, type WeakDryer } from "./status";

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
  /** Someone tapped "I started it" and the estimate hasn't expired yet. */
  inUse: InUse | null;
}

function toView(m: Machine, rs: Report[], runs: MachineRun[], now: number, params: Params, offered: DryerSetting[], viewer: string | null): MachineView {
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
    // A retired or out-of-order machine isn't anyone's to wait for.
    inUse: m.retiredAt || m.adminState === "out_of_order" ? null : currentRun(runs, now, params, viewer),
  };
}

/** Recent runs per machine: anything that could still be showing (the longest cycle plus grace is well under a day). */
async function runsFor(machineIds: string[], now: number) {
  const byMachine = new Map<string, MachineRun[]>();
  if (machineIds.length === 0) return byMachine;
  const rows = await getDb()
    .select()
    .from(machineRuns)
    .where(and(inArray(machineRuns.machineId, machineIds), gte(machineRuns.startedAt, now - 24 * 3_600_000)));
  for (const r of rows) {
    const list = byMachine.get(r.machineId) ?? [];
    list.push(r);
    byMachine.set(r.machineId, list);
  }
  return byMachine;
}

export type VoteTally = { same: number; different: number; mine: "same" | "different" | null };

/** Votes on the given machines' recent reports, per report, plus how `viewer` voted. */
async function votesFor(machineIds: string[], since: number, viewer: string | null) {
  const byReport = new Map<string, VoteTally>();
  if (machineIds.length === 0) return byReport;
  const rows = await getDb()
    .select({ reportId: reportVotes.reportId, vote: reportVotes.vote, deviceHash: reportVotes.deviceHash })
    .from(reportVotes)
    .innerJoin(reports, eq(reportVotes.reportId, reports.id))
    .where(and(inArray(reports.machineId, machineIds), gte(reports.createdAt, since)));
  for (const v of rows) {
    const t = byReport.get(v.reportId) ?? { same: 0, different: 0, mine: null };
    t[v.vote] += 1;
    if (viewer && v.deviceHash === viewer) t.mine = v.vote;
    byReport.set(v.reportId, t);
  }
  return byReport;
}

/**
 * Recent visible reports per machine, with residents' votes folded in: `trust` is the voted weight and
 * `confirmedBy` the "Same here" count (PLAN.md §6.9).
 */
async function reportsFor(machineIds: string[], now: number, params: Params, viewer: string | null = null) {
  const byMachine = new Map<string, Report[]>();
  const votes = new Map<string, VoteTally>();
  if (machineIds.length === 0) return Object.assign(byMachine, { votes });
  const since = now - params.windowMs;
  const [rows, tallies] = await Promise.all([
    getDb()
      .select()
      .from(reports)
      .where(and(inArray(reports.machineId, machineIds), gte(reports.createdAt, since), isNull(reports.hiddenAt), isNull(reports.undoneAt))),
    votesFor(machineIds, since, viewer),
  ]);
  for (const raw of rows) {
    const t = tallies.get(raw.id);
    const r = t ? { ...raw, trust: votedTrust(raw.trust, t.same, t.different, params.votes), confirmedBy: params.votes.same > 0 ? t.same : 0 } : raw;
    const list = byMachine.get(r.machineId) ?? [];
    list.push(r);
    byMachine.set(r.machineId, list);
  }
  return Object.assign(byMachine, { votes: tallies });
}

/** What this room's past dryer loads say about each fabric and thickness, or undefined when learning is off. */
export async function learnedForRoom(roomId: string, now: number, config: Config): Promise<Learned | undefined> {
  const learn = toLearnParams(config);
  if (!learn) return undefined;
  const dryers = await getDb()
    .select({ id: machines.id })
    .from(machines)
    .where(and(eq(machines.roomId, roomId), eq(machines.kind, "dryer")));
  const rs = await reportsFor(dryers.map((d) => d.id), now, toParams(config));
  const stats = learnFabricOutcomes([...rs.values()].flat());
  return { stats, ...learn };
}

/** The room's usual busy hours, or null when it's turned off or there aren't enough taps yet. */
export async function busyForRoom(roomId: string, machineCount: number, now: number, config: Config): Promise<BusyWeek | null> {
  if (!config.busyEnabled || machineCount === 0) return null;
  const rows = await getDb()
    .select({ startedAt: machineRuns.startedAt, endsAt: machineRuns.endsAt, endedAt: machineRuns.endedAt })
    .from(machineRuns)
    .innerJoin(machines, eq(machineRuns.machineId, machines.id))
    .where(and(eq(machines.roomId, roomId), gte(machineRuns.startedAt, now - config.busyWeeks * 7 * 24 * 3_600_000)));
  const week = busyWeek(rows, machineCount, now, config.timeZone, config.busyWeeks);
  return week.runs >= config.busyMinRuns ? week : null;
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
  const ids = ms.map((m) => m.id);
  const viewer = await deviceHash({ create: false });
  const [rs, runs] = await Promise.all([reportsFor(ids, now, params), runsFor(ids, now)]);
  const views = ms.map((m) => ({ ...toView(m, rs.get(m.id) ?? [], runs.get(m.id) ?? [], now, params, offered, viewer), retiredAt: m.retiredAt, position: m.position }));
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
  const config = await getConfig();
  const [ms, learned] = await Promise.all([machinesForRoom(row.room, now, opts, config), learnedForRoom(row.room.id, now, config)]);
  return { ...row, machines: ms, offered: offeredSettings(row.room.dryerSettings), learned, now };
}

export type PublicReport = Pick<Report, "id" | "createdAt" | "outcome" | "setting" | "symptoms" | "errorCode" | "minutes" | "loadSize" | "fabrics" | "thickness" | "damagedItems" | "damageKinds" | "note"> & {
  /** True when the report has a load photo and photos are public (served at /api/photos/[id]). */
  hasPhoto: boolean;
  /** "Same here" / "Not for me" counts, and how this browser voted. */
  votes: VoteTally;
  /** Sent from this browser, so it can't be voted on here. */
  mine: boolean;
  /** This browser flagged it (PLAN.md §19). */
  flagged: boolean;
};

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
  const viewer = await deviceHash({ create: false });
  const [byMachine, runs, learned] = await Promise.all([
    reportsFor([row.machine.id], now, params, viewer),
    runsFor([row.machine.id], now),
    row.machine.kind === "dryer" ? learnedForRoom(row.room.id, now, config) : undefined,
  ]);
  const rs = byMachine.get(row.machine.id) ?? [];
  let view = toView(row.machine, rs, runs.get(row.machine.id) ?? [], now, params, offered, viewer);
  if (view.kind === "dryer") {
    // Room context (sibling fallback and outlier detection) only applies to dryers.
    const inRoom = (await machinesForRoom(row.room, now, { includeRetired: true }, config)).find((m) => m.id === view.id);
    if (inRoom) view = { ...view, recommendation: inRoom.recommendation, weak: inRoom.weak };
  }
  const latest = [...rs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
  const withPhoto = new Set<string>();
  if (config.photosPublic && latest.length > 0) {
    const ids = await db.select({ id: reportPhotos.reportId }).from(reportPhotos).where(inArray(reportPhotos.reportId, latest.map((r) => r.id)));
    for (const { id } of ids) withPhoto.add(id);
  }
  const flaggedByViewer = new Set<string>();
  if (viewer && latest.length > 0) {
    const ids = await db
      .select({ id: reportFlags.reportId })
      .from(reportFlags)
      .where(and(eq(reportFlags.deviceHash, viewer), inArray(reportFlags.reportId, latest.map((r) => r.id))));
    for (const { id } of ids) flaggedByViewer.add(id);
  }
  const recent: PublicReport[] = latest
    .map(({ id, createdAt, outcome, setting, symptoms, errorCode, minutes, loadSize, fabrics, thickness, damagedItems, damageKinds, note, deviceHash: by }) => ({
      id,
      createdAt,
      outcome,
      setting,
      symptoms,
      errorCode,
      minutes,
      loadSize,
      fabrics,
      thickness,
      damagedItems,
      damageKinds,
      hasPhoto: withPhoto.has(id),
      votes: byMachine.votes.get(id) ?? { same: 0, different: 0, mine: null },
      mine: viewer != null && by === viewer,
      flagged: flaggedByViewer.has(id),
      // Admins can keep residents' free text private (Settings → "Show report notes publicly").
      note: config.notesPublic ? note : null,
    }));
  const runMinutes = defaultRunMinutes(row.machine.kind, row.room.minutesPerCycle, params);
  return { ...row, view, recent, retired: row.machine.retiredAt != null, offered, config, runMinutes, learned, now };
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

/** Just the status of one machine (no room context), for deciding whether it counts as fixed. */
export async function machineStatusById(machineId: string, now = Date.now()) {
  const [row] = await getDb()
    .select({ machine: machines, roomName: rooms.name })
    .from(machines)
    .innerJoin(rooms, eq(machines.roomId, rooms.id))
    .where(eq(machines.id, machineId))
    .limit(1);
  if (!row) return null;
  const params = toParams(await getConfig());
  const rs = (await reportsFor([machineId], now, params)).get(machineId) ?? [];
  const m = row.machine;
  const status = computeStatus({ kind: m.kind, adminState: m.adminState ?? null, adminNote: m.adminNote, statusResetAt: m.statusResetAt }, rs, now, params);
  return { machine: m, roomName: row.roomName, status };
}
