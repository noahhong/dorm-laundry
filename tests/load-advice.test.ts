import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseSettingsForm, resolveConfig, toFabricRules } from "../src/lib/config";
import type { DryerSetting } from "../src/lib/labels";
import { suggestForLoad } from "../src/lib/load-advice";
import type { Recommendation } from "../src/lib/status";

const rules = toFabricRules(DEFAULT_CONFIG);
const rec = (setting: DryerSetting, over: Partial<Recommendation> = {}): Recommendation => ({
  setting,
  basis: "reports",
  confidence: "medium",
  tips: [],
  avoid: [],
  ladder: [],
  ...over,
});

describe("suggestForLoad: dryers", () => {
  it("returns nothing when the resident hasn't picked anything", () => {
    expect(suggestForLoad("dryer", { fabrics: [], size: null }, rules, rec("high"))).toBeNull();
  });

  it("keeps the machine's learned setting when the fabrics allow it", () => {
    const a = suggestForLoad("dryer", { fabrics: ["towels"], size: null }, rules, rec("medium"))!;
    expect(a.setting).toBe("medium");
    expect(a.cooler).toBe(false);
    expect(a.why).toMatch(/usual best/);
  });

  it("never goes hotter than the machine's learned setting, even for towels", () => {
    // This dryer dries fine on Low; High would be wasted heat (and it may run hot).
    expect(suggestForLoad("dryer", { fabrics: ["towels"], size: null }, rules, rec("low"))!.setting).toBe("low");
  });

  it("steps down to the most delicate fabric's limit", () => {
    const a = suggestForLoad("dryer", { fabrics: ["everyday", "athletic"], size: null }, rules, rec("high"))!;
    expect(a.setting).toBe("low");
    expect(a.cooler).toBe(true);
    expect(a.why).toBe("Athletic wear shouldn't go above Low.");
    expect(a.tips).toContain("Or dry the athletic wear separately and the everyday clothes on High");
  });

  it("skips a setting that residents say runs hot on this dryer", () => {
    const a = suggestForLoad("dryer", { fabrics: ["athletic"], size: null }, rules, rec("medium", { avoid: [{ setting: "low", reports: 2 }] }))!;
    expect(a.setting).toBe("delicates");
    expect(a.why).toMatch(/Low runs hot on this dryer/);
  });

  it("uses only the settings this room's dryers have", () => {
    const offered: DryerSetting[] = ["no_heat", "medium", "high"];
    const a = suggestForLoad("dryer", { fabrics: ["athletic"], size: null }, rules, rec("high"), offered)!;
    expect(a.setting).toBe("no_heat");
    expect(a.why).toMatch(/don't have Low/);
  });

  it("says to hang-dry when the room has nothing cool enough", () => {
    const a = suggestForLoad("dryer", { fabrics: ["wool"], size: null }, rules, rec("medium"), ["low", "medium", "high"])!;
    expect(a.setting).toBe("low");
    expect(a.why).toMatch(/hang the wool/);
  });

  it("falls back to the site's default start (Medium) with no recommendation", () => {
    const a = suggestForLoad("dryer", { fabrics: ["everyday"], size: null }, rules, null)!;
    expect(a.setting).toBe("medium");
    expect(a.why).toMatch(/safe start/);
  });

  it("adds size and care tips", () => {
    expect(suggestForLoad("dryer", { fabrics: [], size: "full" }, rules, rec("medium"))!.tips).toContain("Full load: expect it to take longer");
    expect(suggestForLoad("dryer", { fabrics: ["everyday"], size: "small" }, rules, rec("high"))!.tips[0]).toMatch(/Small load/);
    expect(suggestForLoad("dryer", { fabrics: ["prints"], size: null }, rules, rec("low"))!.tips[0]).toMatch(/inside out/);
  });
});

describe("suggestForLoad: washers", () => {
  it("picks the coolest water any fabric allows", () => {
    expect(suggestForLoad("washer", { fabrics: ["towels"], size: null }, rules, null)!.setting).toBe("hot");
    const a = suggestForLoad("washer", { fabrics: ["towels", "jeans"], size: null }, rules, null)!;
    expect(a.setting).toBe("cold");
    expect(a.tips).toContain("Mixed load: Cold is safe for all of it");
  });

  it("needs at least one fabric", () => {
    expect(suggestForLoad("washer", { fabrics: [], size: "full" }, rules, null)).toBeNull();
  });
});

describe("fabric rules in admin settings", () => {
  it("admins can change a fabric's limit; bad values fall back to the default", () => {
    const c = resolveConfig([
      { key: "athleticMaxDryer", value: "no_heat" },
      { key: "jeansWash", value: "lava" },
    ]);
    const r = toFabricRules(c);
    expect(r.athletic.maxDryer).toBe("no_heat");
    expect(r.jeans.wash).toBe("cold");
  });

  it("the form rejects an option that isn't on the list", () => {
    const fd = new Map(Object.entries(DEFAULT_CONFIG).map(([k, v]) => [k, v === true ? "on" : v === false ? null : String(v)]));
    fd.set("woolMaxDryer", "extra_crispy");
    const { errors } = parseSettingsForm({ get: (k) => fd.get(k) ?? null });
    expect(errors).toEqual({ woolMaxDryer: "Pick one of the options." });
  });
});
