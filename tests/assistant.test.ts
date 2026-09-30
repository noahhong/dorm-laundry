import { describe, expect, it } from "vitest";
import { SlidingLimiter, cleanConversation, parseLoadToolInput, planLoad, rankMachines, systemPrompt, type AssistantMachine, type AssistantRoom } from "../src/lib/assistant";
import { DEFAULT_CONFIG, toFabricRules } from "../src/lib/config";
import { DRYER_SETTINGS, type DryerSetting } from "../src/lib/labels";
import type { Recommendation, StatusLevel } from "../src/lib/status";

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
const machine = (code: string, kind: "washer" | "dryer", level: StatusLevel, over: Partial<AssistantMachine> = {}): AssistantMachine => ({
  code,
  kind,
  label: `${kind === "dryer" ? "Dryer" : "Washer"} ${code}`,
  status: { level, reason: null, confidence: "medium" },
  recommendation: kind === "dryer" ? rec("high") : null,
  weak: false,
  ...over,
});
const room = (machines: AssistantMachine[], over: Partial<AssistantRoom> = {}): AssistantRoom => ({
  roomName: "Summit Laundry",
  buildingName: "Hedrick Summit",
  offered: DRYER_SETTINGS,
  minutesPerCycle: 45,
  machines,
  focusCode: null,
  ...over,
});

describe("rankMachines", () => {
  it("leaves out broken machines and puts working ones before untested and caution", () => {
    const ms = [machine("a", "dryer", "caution"), machine("b", "dryer", "broken"), machine("c", "dryer", "unknown"), machine("d", "dryer", "works")];
    expect(rankMachines(ms, "dryer", null).map((m) => m.code)).toEqual(["d", "c", "a"]);
  });

  it("sinks a weak dryer below a healthy one", () => {
    const ms = [machine("a", "dryer", "works", { weak: true }), machine("b", "dryer", "works")];
    expect(rankMachines(ms, "dryer", null)[0].code).toBe("b");
  });

  it("prefers the machine the resident is at when it's just as good", () => {
    const ms = [machine("a", "washer", "works"), machine("b", "washer", "works")];
    expect(rankMachines(ms, "washer", "b")[0].code).toBe("b");
  });
});

describe("planLoad", () => {
  it("runs the load rules on the best dryer, so a learned setting is capped by the fabric", () => {
    const plan = planLoad(room([machine("w1", "washer", "works"), machine("d1", "dryer", "works")]), { fabrics: ["athletic"], size: null }, rules);
    expect(plan.picks).toEqual([
      expect.objectContaining({ code: "w1", kind: "washer", setting: "Cold water" }),
      expect.objectContaining({ code: "d1", kind: "dryer", setting: "Low" }),
    ]);
    expect(plan.text).toMatch(/Athletic wear shouldn't go above Low/);
  });

  it("uses only the settings this room's dryers have", () => {
    const r = room([machine("d1", "dryer", "works")], { offered: ["no_heat", "medium", "high"] });
    expect(plan(r, ["athletic"]).picks[0].setting).toBe("No heat");
  });

  it("skips a broken dryer and names it as one to avoid", () => {
    const r = room([machine("d1", "dryer", "broken"), machine("d2", "dryer", "works")]);
    const p = plan(r, ["towels"]);
    expect(p.picks[0].code).toBe("d2");
    expect(p.text).toMatch(/Broken dryers, do not use: Dryer d1/);
  });

  it("says so when every machine of a kind is broken", () => {
    const p = plan(room([machine("d1", "dryer", "broken")]), ["everyday"]);
    expect(p.picks).toEqual([]);
    expect(p.text).toMatch(/every one is broken/);
  });

  it("gives the setting for the machine the resident is at when another one is better", () => {
    const r = room([machine("d1", "dryer", "works"), machine("d2", "dryer", "caution", { recommendation: rec("medium") })], { focusCode: "d2" });
    const p = plan(r, ["towels"]);
    expect(p.picks[0].code).toBe("d1");
    expect(p.text).toMatch(/resident is at Dryer d2 .*use Medium/);
  });

  it("asks for the load when no fabrics were given", () => {
    expect(plan(room([machine("d1", "dryer", "works")]), []).text).toMatch(/Ask the resident/);
  });

  const plan = (r: AssistantRoom, fabrics: Parameters<typeof planLoad>[1]["fabrics"]) => planLoad(r, { fabrics, size: null }, rules);
});

describe("parseLoadToolInput", () => {
  it("keeps known fabrics once and maps an unknown size to none", () => {
    expect(parseLoadToolInput({ fabrics: ["wool", "wool", "leather"], size: "unknown" })).toEqual({ fabrics: ["wool"], size: null });
  });
  it("accepts an overstuffed load", () => {
    expect(parseLoadToolInput({ fabrics: ["towels"], size: "overstuffed" })).toEqual({ fabrics: ["towels"], size: "overstuffed" });
  });
  it("rejects input without a fabric list", () => {
    expect(parseLoadToolInput({ size: "small" })).toBeNull();
    expect(parseLoadToolInput(null)).toBeNull();
  });
});

describe("cleanConversation", () => {
  it("drops a leading assistant turn and trims long messages", () => {
    const out = cleanConversation([
      { role: "assistant", content: "hi" },
      { role: "user", content: "x".repeat(2000) },
    ])!;
    expect(out).toHaveLength(1);
    expect(out[0].content).toHaveLength(600);
  });
  it("needs the last turn to be the resident's", () => {
    expect(cleanConversation([{ role: "user", content: "a" }, { role: "assistant", content: "b" }])).toBeNull();
    expect(cleanConversation([{ role: "user", content: "   " }])).toBeNull();
  });
  it("keeps only the newest turns", () => {
    const many = Array.from({ length: 29 }, (_, i) => ({ role: i % 2 ? ("assistant" as const) : ("user" as const), content: `m${i}` }));
    const out = cleanConversation(many)!;
    expect(out.length).toBeLessThanOrEqual(12);
    expect(out[0].role).toBe("user");
    expect(out.at(-1)!.content).toBe("m28");
  });
});

describe("systemPrompt", () => {
  it("lists the room's machines and the dryer settings it has", () => {
    const s = systemPrompt(room([machine("d1", "dryer", "works")], { offered: ["low", "medium", "high"], focusCode: "d1" }), "Dorm Laundry");
    expect(s).toMatch(/Dryer d1 \(dryer\): works, usual best setting High/);
    expect(s).toMatch(/Dryer settings on the dryers here: Low, Medium, High/);
    expect(s).toMatch(/opened this chat from Dryer d1's page/);
  });
});

describe("SlidingLimiter", () => {
  it("allows up to the limit per window, then frees up as hits age out", () => {
    const l = new SlidingLimiter(1000);
    expect(l.take("ip", 2, 0)).toBe(true);
    expect(l.take("ip", 2, 100)).toBe(true);
    expect(l.take("ip", 2, 200)).toBe(false);
    expect(l.take("other", 2, 200)).toBe(true);
    expect(l.take("ip", 2, 1050)).toBe(true);
  });
});
