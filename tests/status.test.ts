import { describe, expect, it } from "vitest";
import { applyRoomFallback, computeStatus, recommendSetting, type MachineInput, type ReportInput } from "../src/lib/status";

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
