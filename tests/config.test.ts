import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, FIELDS, _defaultParamsMatch, changedFromDefault, parseSettingsForm, resolveConfig, toParams } from "../src/lib/config";
import { DEFAULT_PARAMS, computeStatus, defaultSetting, detectWeakDryers, recommendSetting, type MachineInput, type ReportInput } from "../src/lib/status";

const NOW = Date.UTC(2026, 8, 30, 12);
const H = 3_600_000;
const D = 24 * H;
let seq = 0;
const rep = (p: Partial<ReportInput> & { ago: number }): ReportInput => {
  const { ago, ...rest } = p;
  return { createdAt: NOW - ago, outcome: "dry", setting: null, symptoms: [], deviceHash: `d${seq++}`, trust: 1, ...rest };
};
const dryer: MachineInput = { kind: "dryer", adminState: null, statusResetAt: null };

const form = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? o[k] : null) });
/** A full, valid form built from the defaults (checkboxes: present = on). */
const fullForm = (over: Record<string, string | null> = {}) => {
  const o: Record<string, string> = {};
  for (const f of FIELDS) {
    if (f.kind === "bool") {
      if (f.default) o[f.key] = "on";
    } else o[f.key] = String(f.default);
  }
  for (const [k, v] of Object.entries(over)) {
    if (v === null) delete o[k];
    else o[k] = v;
  }
  return form(o);
};

describe("config", () => {
  it("defaults reproduce the algorithm's built-in parameters", () => {
    expect(_defaultParamsMatch).toBe(true);
    expect(toParams(DEFAULT_CONFIG)).toEqual(DEFAULT_PARAMS);
    expect(changedFromDefault(DEFAULT_CONFIG)).toEqual([]);
  });

  it("every field's default is valid for its own rules", () => {
    const { errors } = parseSettingsForm(fullForm());
    expect(errors).toEqual({});
  });

  it("stored values override defaults; invalid or unknown rows are ignored", () => {
    const c = resolveConfig([
      { key: "brokenMinReporters", value: 2 },
      { key: "windowDays", value: 9999 }, // out of range -> default
      { key: "siteName", value: "Summit Wash" },
      { key: "notesPublic", value: false },
      { key: "nope", value: 1 },
    ]);
    expect(c.brokenMinReporters).toBe(2);
    expect(c.windowDays).toBe(60);
    expect(c.siteName).toBe("Summit Wash");
    expect(c.notesPublic).toBe(false);
    expect(changedFromDefault(c).sort()).toEqual(["brokenMinReporters", "notesPublic", "siteName"]);
  });

  it("form parsing reports per-field errors and never throws", () => {
    const { errors, values } = parseSettingsForm(fullForm({ windowDays: "3", newestBoost: "abc", siteName: "x".repeat(200) }));
    expect(Object.keys(errors).sort()).toEqual(["newestBoost", "siteName", "windowDays"]);
    expect(values.windowDays).toBe(60); // falls back so the form can re-render
  });

  it("unchecked checkboxes mean off, and cross-field rules are enforced", () => {
    const off = parseSettingsForm(fullForm({ notesPublic: null, outlierEnabled: null }));
    expect(off.values.notesPublic).toBe(false);
    expect(off.values.outlierEnabled).toBe(false);
    const bad = parseSettingsForm(fullForm({ outlierRate: "0.3", outlierSiblingRate: "0.4" }));
    expect(bad.errors.outlierSiblingRate).toMatch(/lower/);
  });
});

describe("algorithm honors params", () => {
  const brokenOnce = [rep({ ago: H, outcome: "not_working", symptoms: ["no_heat"] })];

  it("brokenMinReporters=2 holds a single report at Caution until a second device agrees", () => {
    const p = { ...DEFAULT_PARAMS, brokenMinReporters: 2 };
    expect(computeStatus(dryer, brokenOnce, NOW, DEFAULT_PARAMS).level).toBe("broken");
    const one = computeStatus(dryer, brokenOnce, NOW, p);
    expect(one).toMatchObject({ level: "caution", reason: "Reported broken, not yet confirmed" });
    const two = computeStatus(dryer, [...brokenOnce, rep({ ago: 2 * H, outcome: "not_working" })], NOW, p);
    expect(two.level).toBe("broken");
  });

  it("the same device reporting twice never satisfies the quorum", () => {
    const p = { ...DEFAULT_PARAMS, brokenMinReporters: 2 };
    const again = [rep({ ago: H, outcome: "not_working", deviceHash: "x" }), rep({ ago: 2 * H, outcome: "not_working", deviceHash: "x" })];
    expect(computeStatus(dryer, again, NOW, p).level).toBe("caution");
  });

  it("a shorter window forgets old reports; a shorter half-life fades status faster", () => {
    const old = [rep({ ago: 10 * D, outcome: "not_working" })];
    expect(computeStatus(dryer, old, NOW, { ...DEFAULT_PARAMS, windowMs: 7 * D }).level).toBe("unknown");
    const day = [rep({ ago: 2 * D, outcome: "not_working" })];
    expect(computeStatus(dryer, day, NOW, DEFAULT_PARAMS).level).toBe("broken");
    expect(computeStatus(dryer, day, NOW, { ...DEFAULT_PARAMS, statusHalfLifeMs: 6 * H }).level).toBe("unknown");
  });

  it("recommendations only ever use settings the room's dryers actually have", () => {
    // Residents reported on High, but this room's dryers only have Low/Medium.
    const reports = [rep({ ago: D, outcome: "dry", setting: "high" }), rep({ ago: D, outcome: "dry", setting: "high" })];
    const r = recommendSetting(reports, NOW, DEFAULT_PARAMS, ["low", "medium"]);
    expect(r.ladder.map((l) => l.setting)).toEqual(["low", "medium"]);
    expect(r.basis).toBe("default");
    expect(["low", "medium"]).toContain(r.setting);
    const ok = recommendSetting([rep({ ago: D, outcome: "dry", setting: "low" }), rep({ ago: D, outcome: "dry", setting: "low" })], NOW, DEFAULT_PARAMS, ["low", "medium"]);
    expect(ok.setting).toBe("low");
  });

  it("the no-data default adapts when Medium isn't offered", () => {
    expect(defaultSetting(["no_heat", "delicates", "low", "medium", "high"])).toBe("medium");
    expect(defaultSetting(["low", "high"])).toBe("low");
    expect(defaultSetting(["delicates", "low", "high"])).toBe("low");
    expect(recommendSetting([], NOW, DEFAULT_PARAMS, ["low", "high"]).setting).toBe("low");
  });

  it("weak-dryer detection can be switched off and its thresholds tuned", () => {
    const many = (n: number, outcome: string) => Array.from({ length: n }, () => rep({ ago: D, outcome, setting: "medium" }));
    const room = [{ id: "weak", reports: [...many(2, "wet"), ...many(2, "dry")] }, { id: "a", reports: many(4, "dry") }, { id: "b", reports: many(4, "dry") }];
    expect(detectWeakDryers(room, NOW, DEFAULT_PARAMS).has("weak")).toBe(true);
    expect(detectWeakDryers(room, NOW, { ...DEFAULT_PARAMS, outlier: { ...DEFAULT_PARAMS.outlier, enabled: false } }).size).toBe(0);
    expect(detectWeakDryers(room, NOW, { ...DEFAULT_PARAMS, outlier: { ...DEFAULT_PARAMS.outlier, rate: 0.9 } }).size).toBe(0);
  });
});

import { csvCell, csvRow } from "../src/lib/csv";
import { offeredSettings, settingsToStore } from "../src/lib/rooms";

describe("csv", () => {
  it("quotes specials and neutralizes spreadsheet formulas", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell(null)).toBe("");
    expect(csvRow(["a", 1, null, "b,c"])).toBe('a,1,,"b,c"');
  });
});

describe("room dryer settings", () => {
  it("null means the full ladder; stored subsets come back coolest-first; junk is ignored", () => {
    expect(offeredSettings(null)).toEqual(["no_heat", "delicates", "low", "medium", "high"]);
    expect(offeredSettings(["high", "low"])).toEqual(["low", "high"]);
    expect(offeredSettings(["bogus"])).toEqual(["no_heat", "delicates", "low", "medium", "high"]);
  });
  it("form picks: all five store as null, a subset stores as-is, none is rejected", () => {
    expect(settingsToStore(["low", "medium", "high", "delicates", "no_heat"])).toBeNull();
    expect(settingsToStore(["high", "low", "x"])).toEqual(["low", "high"]);
    expect(settingsToStore([])).toBe("empty");
  });
});
