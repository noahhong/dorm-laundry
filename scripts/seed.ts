// Seeds one building, one room and a mix of machines with realistic reports so every UI state shows up.
// Usage: npm run db:seed            (skips if the demo building exists)
//        npm run db:seed -- --reset (deletes the demo building first)
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { createDb } from "../src/lib/db";
import { buildings, machineRuns, machines, reports, rooms } from "../src/lib/db/schema";
import { randomId } from "../src/lib/ids";
import { tzOffsetMinutes } from "../src/lib/busy";

const H = 3_600_000;
const D = 24 * H;

type R = { ago: number; outcome: string; setting?: string; symptoms?: string[]; note?: string; minutes?: number };

/** `running`: someone tapped "I started it" this many minutes ago, for a cycle of `minutes`. */
const MACHINES: { code: string; kind: "washer" | "dryer"; label: string; wash?: string; reports: R[]; running?: { ago: number; minutes: number } }[] = [
  { code: "hsw1", kind: "washer", label: "Washer 1", wash: "101", reports: [
    { ago: 2 * H, outcome: "good", setting: "cold" }, { ago: 9 * H, outcome: "good", setting: "warm" }, { ago: 30 * H, outcome: "good", setting: "cold" },
  ] },
  { code: "hsw2", kind: "washer", label: "Washer 2", wash: "102", reports: [
    { ago: 3 * H, outcome: "not_working", symptoms: ["took_money"], note: "Charged me $2.25 and nothing happened. Filed a refund in the app." },
    { ago: 20 * H, outcome: "not_working", symptoms: ["took_money", "wont_start"] },
  ] },
  { code: "hsw3", kind: "washer", label: "Washer 3", wash: "103", reports: [
    { ago: 5 * H, outcome: "soaking", setting: "cold", note: "Clothes were dripping, had to run it again" },
    { ago: 2 * D, outcome: "good", setting: "hot" },
  ] },
  { code: "hsw4", kind: "washer", label: "Washer 4", wash: "104", reports: [] },
  { code: "hsd1", kind: "dryer", label: "Dryer 1", wash: "201", reports: [
    { ago: 1 * H, outcome: "dry", setting: "medium", minutes: 45 }, { ago: 1 * D, outcome: "dry", setting: "medium" },
    { ago: 3 * D, outcome: "damp", setting: "low" }, { ago: 6 * D, outcome: "dry", setting: "medium" },
  ] },
  { code: "hsd2", kind: "dryer", label: "Dryer 2", wash: "202", reports: [
    { ago: 4 * H, outcome: "too_hot", setting: "medium", note: "Gym shorts came out shiny on the waistband" },
    { ago: 2 * D, outcome: "damaged", setting: "medium", note: "Melted the print on my hoodie :(" },
    { ago: 1 * D, outcome: "dry", setting: "low", minutes: 45 }, { ago: 4 * D, outcome: "dry", setting: "low" },
    { ago: 5 * D, outcome: "dry", setting: "delicates" },
  ] },
  { code: "hsd3", kind: "dryer", label: "Dryer 3", wash: "203", reports: [
    { ago: 2 * H, outcome: "not_working", symptoms: ["no_heat"], note: "Runs but air is cold" },
    { ago: 10 * H, outcome: "wet", setting: "high" },
  ] },
  { code: "hsd4", kind: "dryer", label: "Dryer 4", wash: "204", reports: [
    { ago: 6 * H, outcome: "damp", setting: "high", minutes: 60 }, { ago: 2 * D, outcome: "wet", setting: "medium" },
    { ago: 3 * D, outcome: "dry", setting: "high", minutes: 90, note: "Needed two cycles" },
  ] },
  { code: "hsd5", kind: "dryer", label: "Dryer 5", wash: "205", reports: [] },
  { code: "hsd6", kind: "dryer", label: "Dryer 6", wash: "206", reports: [
    { ago: 8 * H, outcome: "dry", setting: "high" }, { ago: 2 * D, outcome: "dry", setting: "high" }, { ago: 9 * D, outcome: "damp", setting: "medium" },
  ], running: { ago: 20, minutes: 45 } },
];

async function main() {
  const db = createDb();
  const reset = process.argv.includes("--reset");
  const [existing] = await db.select().from(buildings).where(eq(buildings.slug, "hedrick-summit"));
  if (existing) {
    if (!reset) {
      console.log("Seed building already exists; pass --reset to recreate it.");
      return;
    }
    await db.delete(buildings).where(eq(buildings.id, existing.id));
  }
  const now = Date.now();
  const buildingId = randomId();
  const roomId = randomId();
  await db.insert(buildings).values({ id: buildingId, slug: "hedrick-summit", name: "Hedrick Summit", campus: "UCLA", createdAt: now });
  await db.insert(rooms).values({ id: roomId, buildingId, slug: "laundry", name: "Laundry room", locationHint: "Ground floor, past the mailroom", createdAt: now });
  let position = 0;
  let n = 0;
  const machineIds: string[] = [];
  for (const m of MACHINES) {
    const machineId = randomId();
    machineIds.push(machineId);
    await db.insert(machines).values({ id: machineId, roomId, code: m.code, kind: m.kind, label: m.label, washMachineNumber: m.wash ?? null, position: position++, createdAt: now - 30 * D });
    for (const r of m.reports) {
      const fake = createHash("sha256").update(`seed-${n++}`).digest("hex");
      await db.insert(reports).values({
        id: randomId(), machineId, createdAt: now - r.ago, outcome: r.outcome, setting: r.setting ?? null, symptoms: r.symptoms ?? [],
        minutes: r.minutes ?? null, note: r.note ?? null, deviceHash: fake, ipHash: fake, trust: 1,
      });
    }
    if (m.running) {
      const fake = createHash("sha256").update(`seed-run-${m.code}`).digest("hex");
      const startedAt = now - m.running.ago * 60_000;
      await db.insert(machineRuns).values({ id: randomId(), machineId, startedAt, endsAt: startedAt + m.running.minutes * 60_000, deviceHash: fake, ipHash: fake });
    }
  }
  const history = await seedRunHistory(db, machineIds, now);
  console.log(`✓ seeded Hedrick Summit → /b/hedrick-summit/laundry (${MACHINES.length} machines, ${n} reports, ${history} past timers)`);
}

/** Four weeks of finished "I started it" timers, busiest on weekday evenings, so busy hours has something to show. */
async function seedRunHistory(db: ReturnType<typeof createDb>, machineIds: string[], now: number) {
  // Chance a machine is started in a given local hour (index = hour).
  const byHour = [0, 0, 0, 0, 0, 0, 0, 0.05, 0.1, 0.15, 0.2, 0.2, 0.15, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.55, 0.6, 0.55, 0.4, 0.2];
  const rand = (key: string) => createHash("sha256").update(key).digest().readUInt32BE(0) / 2 ** 32;
  const offset = tzOffsetMinutes(now, "America/Los_Angeles") * 60_000;
  const today = Math.floor((now + offset) / D) * D - offset;
  const rows: (typeof machineRuns.$inferInsert)[] = [];
  for (let day = 1; day <= 28; day++) {
    const start = today - day * D;
    const weekend = [0, 6].includes(new Date(start + offset + 12 * H).getUTCDay());
    for (const [i, machineId] of machineIds.entries()) {
      for (let h = 7; h < 24; h++) {
        const p = byHour[h] * (weekend ? 0.45 : 0.65);
        if (rand(`run-${day}-${i}-${h}`) >= p) continue;
        const startedAt = start + h * H + Math.floor(rand(`min-${day}-${i}-${h}`) * 20) * 60_000;
        const fake = createHash("sha256").update(`seed-hist-${day}-${i}-${h}`).digest("hex");
        rows.push({ id: randomId(), machineId, startedAt, endsAt: startedAt + 45 * 60_000, deviceHash: fake, ipHash: fake });
      }
    }
  }
  for (let i = 0; i < rows.length; i += 200) await db.insert(machineRuns).values(rows.slice(i, i + 200));
  return rows.length;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
