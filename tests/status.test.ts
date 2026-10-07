import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, applyRoomFallback, computeStatus, currentRun, defaultRunMinutes, detectWeakDryers, recommendSetting, type MachineInput, type ReportInput, type RunInput } from "../src/lib/status";

const NOW = Date.UTC(2026, 8, 30, 12);
const H = 3_600_000;
const D = 24 * H;
let seq = 0;
function rep(p: Partial<ReportInput> & { ago: number }): ReportInput {
  const { ago, ...rest } = p;
  return { createdAt: NOW - ago, outcome: "dry", setting: null, symptoms: [], deviceHash: `dev${seq++}`, trust: 1, ...rest };
}
const dryer: MachineInput = { kind: "dryer", adminState: null, statusResetAt: null };
const washer: MachineInput = { kind: "washer", adminState: null, statusResetAt: null };

describe("computeStatus", () => {
  it("is unknown with no reports", () => {
    const s = computeStatus(dryer, [], NOW);
    expect(s.level).toBe("unknown");
    expect(s.source).toBe("none");
  });

  it("one fresh broken report marks the machine broken with its symptom", () => {
    const s = computeStatus(dryer, [rep({ ago: H, outcome: "not_working", symptoms: ["no_heat"] })], NOW);
    expect(s.level).toBe("broken");
    expect(s.reason).toBe("No heat");
  });

  it("broken decays to unknown after about a week, keeping a stale hint", () => {
    const s = computeStatus(dryer, [rep({ ago: 8 * D, outcome: "not_working" })], NOW);
    expect(s.level).toBe("unknown");
    expect(s.staleHint?.outcome).toBe("not_working");
  });

  it("a newer 'works' report after a broken one yields mixed caution", () => {
    const s = computeStatus(dryer, [rep({ ago: 6 * H, outcome: "not_working" }), rep({ ago: 0, outcome: "dry", setting: "medium" })], NOW);
    expect(s.level).toBe("caution");
    expect(s.reason).toBe("Mixed reports");
  });

  it("an old broken report is outweighed by a fresh works report", () => {
    const s = computeStatus(dryer, [rep({ ago: 5 * D, outcome: "not_working" }), rep({ ago: H, outcome: "dry" }), rep({ ago: 2 * H, outcome: "dry" })], NOW);
    expect(s.level).toBe("works");
  });

  it("counts only the latest report per device (no spamming)", () => {
    const spam = Array.from({ length: 10 }, (_, i) => rep({ ago: i * H + H, outcome: "not_working", deviceHash: "spammer" }));
    const s = computeStatus(dryer, [...spam, rep({ ago: 30 * 60_000, outcome: "dry" }), rep({ ago: 2 * H, outcome: "dry" })], NOW);
    expect(s.level).not.toBe("broken");
  });

  it("admin out-of-order overrides everything", () => {
    const s = computeStatus({ ...dryer, adminState: "out_of_order", adminNote: "WASH ticket 12" }, [rep({ ago: H })], NOW);
    expect(s).toMatchObject({ level: "broken", source: "admin", reason: "WASH ticket 12" });
  });

  it("mark fixed ignores older reports", () => {
    const s = computeStatus({ ...dryer, statusResetAt: NOW - H }, [rep({ ago: 2 * H, outcome: "not_working" })], NOW);
    expect(s.level).toBe("unknown");
    expect(s.staleHint).toBeNull();
  });

  it("wet on Low is a settings problem, not a broken machine", () => {
    const s = computeStatus(dryer, [rep({ ago: H, outcome: "wet", setting: "low" }), rep({ ago: 2 * H, outcome: "dry", setting: "high" })], NOW);
    expect(s.level).not.toBe("broken");
  });

  it("too hot on Low flags caution: runs hot", () => {
    const s = computeStatus(dryer, [rep({ ago: H, outcome: "damaged", setting: "low" })], NOW);
    expect(s).toMatchObject({ level: "caution", reason: "Runs hot" });
  });

  it("washer that didn't spin is caution; caution-only symptoms are not broken", () => {
    expect(computeStatus(washer, [rep({ ago: H, outcome: "soaking" })], NOW).level).toBe("caution");
    expect(computeStatus(washer, [rep({ ago: H, outcome: "not_working", symptoms: ["loud"] })], NOW)).toMatchObject({
      level: "caution",
      reason: "Loud / shaking",
    });
  });

  it("confidence grows with evidence", () => {
    const many = Array.from({ length: 5 }, () => rep({ ago: H, outcome: "dry" }));
    expect(computeStatus(dryer, many, NOW).confidence).toBe("high");
    expect(computeStatus(dryer, [rep({ ago: 6 * D, outcome: "dry" })], NOW).confidence).toBe("low");
  });
});

describe("recommendSetting", () => {
  it("defaults to Medium with no data", () => {
    const r = recommendSetting([], NOW);
    expect(r).toMatchObject({ setting: "medium", basis: "default", confidence: "none" });
  });

  it("recommends the setting that dries", () => {
    const r = recommendSetting([rep({ ago: D, outcome: "dry", setting: "medium" }), rep({ ago: 2 * D, outcome: "dry", setting: "medium" })], NOW);
    expect(r.setting).toBe("medium");
    expect(r.basis).toBe("reports");
  });

  it("prefers the cooler of two equally good settings", () => {
    const r = recommendSetting(
      [
        rep({ ago: D, outcome: "dry", setting: "high" }),
        rep({ ago: D, outcome: "dry", setting: "high" }),
        rep({ ago: D, outcome: "dry", setting: "low" }),
        rep({ ago: D, outcome: "dry", setting: "low" }),
      ],
      NOW,
    );
    expect(r.setting).toBe("low");
  });

  it("steers away from a hot machine and warns about hotter settings", () => {
    const r = recommendSetting(
      [
        rep({ ago: D, outcome: "damaged", setting: "medium" }),
        rep({ ago: 2 * D, outcome: "too_hot", setting: "medium" }),
        rep({ ago: D, outcome: "dry", setting: "low" }),
        rep({ ago: 3 * D, outcome: "dry", setting: "low" }),
      ],
      NOW,
    );
    expect(r.setting).toBe("low");
    expect(r.avoid.map((a) => a.setting)).toEqual(expect.arrayContaining(["medium", "high"]));
  });

  it("steps up when a setting leaves clothes wet", () => {
    const r = recommendSetting([rep({ ago: D, outcome: "wet", setting: "medium" }), rep({ ago: D, outcome: "damp", setting: "medium" })], NOW);
    expect(r.setting).toBe("high");
    expect(r.tips.join(" ")).toMatch(/damp/i);
  });

  it("suggests extra time when even High under-dries", () => {
    const r = recommendSetting([rep({ ago: D, outcome: "wet", setting: "high" }), rep({ ago: D, outcome: "wet", setting: "high" })], NOW);
    expect(r.setting).toBe("high");
    expect(r.tips.join(" ")).toMatch(/extra time/);
  });

  it("does not let one device dominate a setting", () => {
    const spam = Array.from({ length: 8 }, (_, i) => rep({ ago: i * H, outcome: "dry", setting: "high", deviceHash: "x" }));
    const r = recommendSetting([...spam, rep({ ago: D, outcome: "dry", setting: "low" }), rep({ ago: D, outcome: "dry", setting: "low" })], NOW);
    expect(r.setting).toBe("low");
  });

  it("ladder reports direct per-setting verdicts", () => {
    const r = recommendSetting([rep({ ago: D, outcome: "too_hot", setting: "high" }), rep({ ago: D, outcome: "dry", setting: "low" })], NOW);
    const bySetting = Object.fromEntries(r.ladder.map((l) => [l.setting, l.verdict]));
    expect(bySetting).toMatchObject({ high: "over", low: "good", medium: "none" });
  });
});

describe("applyRoomFallback", () => {
  const dry = (setting: string) => recommendSetting([rep({ ago: D, outcome: "dry", setting }), rep({ ago: D, outcome: "dry", setting })], NOW);
  const none = () => recommendSetting([], NOW);

  it("borrows the lower median of sibling settings for dryers without data", () => {
    const out = applyRoomFallback([dry("low"), dry("medium"), dry("high"), dry("high"), none()]);
    expect(out[4]).toMatchObject({ setting: "medium", basis: "room", roomMachines: 4, roomRange: { min: "low", max: "high" } });
    expect(out[2].setting).toBe("high"); // informed dryers untouched
  });

  it("leans cooler when the room is split", () => {
    expect(applyRoomFallback([dry("high"), dry("low"), none()])[2].setting).toBe("low");
  });

  it("needs at least two informed siblings", () => {
    expect(applyRoomFallback([dry("low"), none()])[1].basis).toBe("default");
  });
});

describe("detectWeakDryers", () => {
  const many = (n: number, outcome: string, setting = "medium") => Array.from({ length: n }, () => rep({ ago: D, outcome, setting }));
  const good = (id: string) => ({ id, reports: many(4, "dry") });

  it("flags a dryer that is often damp at Medium/High when its siblings dry fine", () => {
    const weak = { id: "weak", reports: [...many(2, "wet"), ...many(1, "damp", "high"), ...many(1, "dry")] };
    const out = detectWeakDryers([weak, good("a"), good("b")], NOW);
    expect([...out.keys()]).toEqual(["weak"]);
    expect(out.get("weak")!.rate).toBeGreaterThan(0.5);
    expect(out.get("weak")!.siblingRate).toBeLessThan(0.1);
  });

  it("does not flag when the whole room is weak (that's the room, not the machine)", () => {
    const bad = (id: string) => ({ id, reports: many(4, "wet") });
    expect(detectWeakDryers([bad("a"), bad("b"), bad("c")], NOW).size).toBe(0);
  });

  it("needs enough evidence: 3 reports on the dryer and 2+ informed siblings", () => {
    const few = { id: "few", reports: many(2, "wet") };
    expect(detectWeakDryers([few, good("a"), good("b")], NOW).size).toBe(0);
    const weak = { id: "weak", reports: many(4, "wet") };
    expect(detectWeakDryers([weak, good("a")], NOW).size).toBe(0);
  });

  it("ignores Low/Delicates (damp there is expected) and dedupes one device spamming", () => {
    const lowOnly = { id: "low", reports: many(5, "wet", "low") };
    expect(detectWeakDryers([lowOnly, good("a"), good("b")], NOW).size).toBe(0);
    const spam = { id: "spam", reports: Array.from({ length: 6 }, (_, i) => rep({ ago: i * H, outcome: "wet", setting: "medium", deviceHash: "one" })) };
    expect(detectWeakDryers([spam, good("a"), good("b")], NOW).size).toBe(0);
  });
});

describe("currentRun (\"I started it\" timer)", () => {
  const M = 60_000;
  const run = (p: Partial<RunInput> & { ago: number; minutes: number }): RunInput => {
    const { ago, minutes, ...rest } = p;
    return { id: `run${seq++}`, startedAt: NOW - ago, endsAt: NOW - ago + minutes * M, endedAt: null, deviceHash: "a", ...rest };
  };

  it("is null with no runs", () => {
    expect(currentRun([], NOW)).toBeNull();
  });

  it("shows running until the estimate, with the end time", () => {
    const r = run({ ago: 10 * M, minutes: 45 });
    expect(currentRun([r], NOW)).toMatchObject({ state: "running", runId: r.id, endsAt: NOW + 35 * M, expiresAt: NOW + 50 * M });
  });

  it("shows finishing during the grace period, then expires on its own", () => {
    expect(currentRun([run({ ago: 50 * M, minutes: 45 })], NOW)?.state).toBe("finishing");
    expect(currentRun([run({ ago: 60 * M, minutes: 45 })], NOW)).toBeNull();
    expect(currentRun([run({ ago: 50 * M, minutes: 45 })], NOW, { ...DEFAULT_PARAMS, run: { ...DEFAULT_PARAMS.run, graceMs: 0 } })).toBeNull();
  });

  it("only the newest run counts, and a cancelled newest run frees the machine", () => {
    const older = run({ ago: 30 * M, minutes: 60, deviceHash: "a" });
    const newer = run({ ago: 5 * M, minutes: 30, deviceHash: "b" });
    expect(currentRun([newer, older], NOW)?.runId).toBe(newer.id);
    expect(currentRun([older, { ...newer, endedAt: NOW - M }], NOW)).toBeNull();
  });

  it("ignores runs that start in the future", () => {
    expect(currentRun([run({ ago: -5 * M, minutes: 30 })], NOW)).toBeNull();
  });

  it("marks the viewer's own run as mine", () => {
    const r = run({ ago: M, minutes: 30, deviceHash: "me" });
    expect(currentRun([r], NOW, DEFAULT_PARAMS, "me")?.mine).toBe(true);
    expect(currentRun([r], NOW, DEFAULT_PARAMS, "someone-else")?.mine).toBe(false);
    expect(currentRun([r], NOW)?.mine).toBe(false);
  });

  it("only shows the starter that their done alert is on", () => {
    const r = run({ ago: M, minutes: 30, deviceHash: "me", alertEndpoint: "https://fcm.googleapis.com/fcm/send/x" });
    expect(currentRun([r], NOW, DEFAULT_PARAMS, "me")?.alertOn).toBe(true);
    expect(currentRun([r], NOW, DEFAULT_PARAMS, "someone-else")?.alertOn).toBe(false);
    expect(currentRun([{ ...r, alertEndpoint: null }], NOW, DEFAULT_PARAMS, "me")?.alertOn).toBe(false);
  });

  it("pre-fills the room's paid dryer cycle, else the site-wide defaults", () => {
    expect(defaultRunMinutes("dryer", 60)).toBe(60);
    expect(defaultRunMinutes("dryer", null)).toBe(DEFAULT_PARAMS.run.dryerMinutes);
    expect(defaultRunMinutes("washer", 60)).toBe(DEFAULT_PARAMS.run.washerMinutes);
  });
});
