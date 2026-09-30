// Busy hours (§6.10), "Same here" / "Not for me" votes (§6.9) and learning per fabric + thickness (§6.7).
import { describe, expect, it } from "vitest";
import { busyLevel, busyWeek, hourLabel, quietestWindow, tzOffsetMinutes } from "../src/lib/busy";
import { DEFAULT_CONFIG, parseSettingsForm, toLearnParams } from "../src/lib/config";
import type { DryerSetting } from "../src/lib/labels";
import { learnFabricOutcomes, suggestForLoad, type Learned, type LearnInput } from "../src/lib/load-advice";
import { toFabricRules } from "../src/lib/config";
import { computeStatus, DEFAULT_PARAMS, votedTrust, type Recommendation, type ReportInput } from "../src/lib/status";

const MIN = 60_000;
const H = 60 * MIN;
const D = 24 * H;
// Wednesday 30 Sep 2026, 12:00 in Los Angeles (19:00 UTC, PDT = UTC-7).
const NOW = Date.UTC(2026, 8, 30, 19);
const LA = "America/Los_Angeles";

describe("busy hours", () => {
  it("knows the room's UTC offset, and falls back to UTC for a bad zone", () => {
    expect(tzOffsetMinutes(NOW, LA)).toBe(-420);
    expect(tzOffsetMinutes(Date.UTC(2026, 0, 15, 12), LA)).toBe(-480);
    expect(tzOffsetMinutes(NOW, "Not/AZone")).toBe(0);
  });

  it("splits runs across local hours and averages over the weeks covered", () => {
    // Every Tuesday for 4 weeks, one of 2 machines runs 8:30–9:30pm local (03:30–04:30 UTC Wednesday).
    const runs = [1, 2, 3, 4].map((w) => {
      const start = Date.UTC(2026, 8, 30, 3, 30) - (w - 1) * 7 * D;
      return { startedAt: start, endsAt: start + H, endedAt: null };
    });
    const week = busyWeek(runs, 2, NOW, LA, 4);
    expect(week.runs).toBe(4);
    expect(week.today).toBe(3);
    expect(week.hour).toBe(12);
    // Tuesday (2) 8pm: half an hour of one machine in two → 0.25 each week.
    expect(week.share[2][20]).toBeCloseTo(0.25, 5);
    expect(week.share[2][21]).toBeCloseTo(0.25, 5);
    expect(week.share[2][19]).toBe(0);
    expect(week.share[3][20]).toBe(0);
  });

  it("uses when the timer was stopped, not the estimate", () => {
    const start = NOW - 3 * H;
    const week = busyWeek([{ startedAt: start, endsAt: start + 2 * H, endedAt: start + 30 * MIN }], 1, NOW, LA, 1);
    const total = week.share.flat().reduce((a, b) => a + b, 0);
    // Half an hour on one machine, averaged over the one day of data (days/7 floors at 1 weekday).
    expect(total).toBeCloseTo(0.5, 5);
  });

  it("returns an empty week with no runs", () => {
    expect(busyWeek([], 4, NOW, LA, 4).runs).toBe(0);
  });

  it("labels hours and levels", () => {
    expect([0, 9, 12, 15, 24].map(hourLabel)).toEqual(["12am", "9am", "12pm", "3pm", "12am"]);
    expect([0, 0.3, 0.7].map(busyLevel)).toEqual(["quiet", "busy", "packed"]);
  });

  it("finds the quietest two hours, earliest on a tie, and gives up when all are packed", () => {
    const day = new Array(24).fill(0.5);
    day[10] = day[11] = 0.1;
    day[15] = day[16] = 0.1;
    expect(quietestWindow(day, 6, 24)).toEqual({ start: 10, end: 12 });
    expect(quietestWindow(day, 12, 24)).toEqual({ start: 15, end: 17 });
    expect(quietestWindow(new Array(24).fill(0.9), 6, 24)).toBeNull();
  });
});

describe("report votes", () => {
  const v = DEFAULT_PARAMS.votes;
  it("adds and takes away weight, within bounds", () => {
    expect(votedTrust(1, 0, 0, v)).toBe(1);
    expect(votedTrust(1, 2, 0, v)).toBe(2);
    expect(votedTrust(1, 10, 0, v)).toBe(2.5);
    expect(votedTrust(1, 0, 1, v)).toBe(0.5);
    expect(votedTrust(1, 1, 3, v)).toBe(0);
  });

  const rep = (p: Partial<ReportInput>): ReportInput => ({ createdAt: NOW - H, outcome: "dry", setting: null, symptoms: [], deviceHash: "a", trust: 1, ...p });
  const machine = { kind: "washer" as const, adminState: null, statusResetAt: null };

  it("counts 'Same here' toward confirming Broken", () => {
    const params = { ...DEFAULT_PARAMS, brokenMinReporters: 2 };
    const broken = rep({ outcome: "not_working", symptoms: ["wont_start"] });
    expect(computeStatus(machine, [broken], NOW, params).level).toBe("caution");
    expect(computeStatus(machine, [{ ...broken, confirmedBy: 1 }], NOW, params).level).toBe("broken");
  });

  it("ignores a report voted down to zero", () => {
    const broken = rep({ outcome: "not_working", symptoms: ["wont_start"], trust: 0 });
    expect(computeStatus(machine, [broken], NOW).level).toBe("unknown");
  });

  it("has settings that default to the algorithm's built-in values", () => {
    expect(DEFAULT_CONFIG.voteSameWeight).toBe(v.same);
    expect(DEFAULT_CONFIG.voteDifferentWeight).toBe(v.different);
    expect(DEFAULT_CONFIG.voteMaxBoost).toBe(v.max);
  });
});

describe("learning per fabric and thickness", () => {
  const rules = toFabricRules(DEFAULT_CONFIG);
  const rec = (setting: DryerSetting): Recommendation => ({ setting, basis: "reports", confidence: "medium", tips: [], avoid: [], ladder: [] });
  const r = (p: Partial<LearnInput>): LearnInput => ({ outcome: "dry", setting: "medium", fabrics: ["everyday"], thickness: null, damagedItems: null, trust: 1, ...p });
  const learned = (reports: LearnInput[]): Learned => ({ stats: learnFabricOutcomes(reports), minLoads: 3, rate: 0.5 });

  it("tallies by fabric, thickness and setting, and only blames damaged fabrics", () => {
    const stats = learnFabricOutcomes([
      r({ outcome: "damp", thickness: "thick" }),
      r({ outcome: "damaged", fabrics: ["everyday", "athletic"], damagedItems: ["athletic"] }),
      r({ outcome: "too_hot", trust: 0 }),
      r({ outcome: "not_working" }),
      r({ fabrics: null }),
    ]);
    expect(stats["everyday|thick"].medium).toEqual({ loads: 1, hot: 0, damp: 1 });
    expect(stats["everyday|*"].medium).toEqual({ loads: 2, hot: 0, damp: 1 });
    expect(stats["athletic|*"].medium).toEqual({ loads: 1, hot: 1, damp: 0 });
  });

  it("goes one hotter for a thick cotton hoodie that keeps coming out damp", () => {
    const l = learned([1, 2, 3, 4].map((i) => r({ outcome: i < 4 ? "damp" : "dry", thickness: "thick" })));
    const a = suggestForLoad("dryer", { fabrics: ["everyday"], size: null, thickness: "thick" }, rules, rec("medium"), undefined, l)!;
    expect(a.setting).toBe("high");
    expect(a.why).toBe("Residents here say thick everyday clothes came out damp on Medium (3 of 4 loads), so go one hotter.");
    expect(a.tips).toContain("Thick items take longer: check seams, hoods and pockets before you take it out");
  });

  it("doesn't apply what thick loads taught to a thin load, unless there's too little thin data", () => {
    const l = learned([1, 2, 3].map(() => r({ outcome: "damp", thickness: "thick" })).concat([1, 2, 3].map(() => r({ thickness: "thin" }))));
    expect(suggestForLoad("dryer", { fabrics: ["everyday"], size: null, thickness: "thin" }, rules, rec("medium"), undefined, l)!.setting).toBe("medium");
  });

  it("never goes above the fabric's limit: says so and suggests more time instead", () => {
    const l = learned([1, 2, 3].map(() => r({ outcome: "damp", setting: "medium", fabrics: ["jeans"] })));
    const a = suggestForLoad("dryer", { fabrics: ["jeans"], size: null }, rules, rec("medium"), undefined, l)!;
    expect(a.setting).toBe("medium");
    expect(a.why).toContain("came out damp on Medium (3 of 3 loads).");
    expect(a.tips).toContain("Add about 15 minutes, or split it into two loads");
  });

  it("goes cooler when residents say a fabric came out too hot", () => {
    const l = learned([1, 2, 3].map(() => r({ outcome: "damaged", setting: "low", fabrics: ["athletic"] })));
    const a = suggestForLoad("dryer", { fabrics: ["athletic"], size: null }, rules, rec("medium"), undefined, l)!;
    expect(a.setting).toBe("delicates");
    expect(a.cooler).toBe(true);
    expect(a.why).toBe("Residents here say athletic wear came out too hot on Low (3 of 3 loads), so go one cooler.");
  });

  it("does nothing below the minimum number of loads", () => {
    const l = learned([1, 2].map(() => r({ outcome: "damp" })));
    expect(suggestForLoad("dryer", { fabrics: ["everyday"], size: null }, rules, rec("medium"), undefined, l)!.setting).toBe("medium");
  });

  it("is switched off in Settings", () => {
    expect(toLearnParams({ ...DEFAULT_CONFIG, learnEnabled: false })).toBeUndefined();
    expect(toLearnParams(DEFAULT_CONFIG)).toEqual({ minLoads: 3, rate: 0.5 });
  });
});

describe("time zone setting", () => {
  it("rejects a name the browser doesn't know", () => {
    const form = (tz: string) => {
      const values: Record<string, string> = Object.fromEntries(Object.entries(DEFAULT_CONFIG).map(([k, v]) => [k, String(v)]));
      values.timeZone = tz;
      return { get: (k: string) => values[k] ?? null };
    };
    expect(parseSettingsForm(form("America/Los_Angeles")).errors.timeZone).toBeUndefined();
    expect(parseSettingsForm(form("Mars/Olympus")).errors.timeZone).toBeDefined();
  });
});
