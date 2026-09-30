import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, toFabricRules } from "../src/lib/config";
import { damageSummary, loadSummary } from "../src/lib/labels";
import { suggestForLoad } from "../src/lib/load-advice";
import { decodePhoto, PHOTO_MAX_BYTES } from "../src/lib/photo";
import { computeStatus } from "../src/lib/status";
import { checkForKind, reportSchema } from "../src/lib/validation";

const jpeg = (n: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(n)]);
const dataUrl = (b: Buffer, type = "image/jpeg") => `data:${type};base64,${b.toString("base64")}`;

describe("load photos", () => {
  it("accepts a small JPEG", () => {
    expect(decodePhoto(dataUrl(jpeg(1000)))?.length).toBe(1004);
  });

  it("rejects other types, fake JPEGs, junk and oversize files", () => {
    expect(decodePhoto(dataUrl(jpeg(1000), "image/png"))).toBeNull();
    expect(decodePhoto(dataUrl(Buffer.from("<svg onload=alert(1)>")))).toBeNull();
    expect(decodePhoto("data:image/jpeg;base64,@@@")).toBeNull();
    expect(decodePhoto(dataUrl(jpeg(PHOTO_MAX_BYTES)))).toBeNull();
  });
});

describe("damage and load in reports", () => {
  const base = { code: "hsw1", elapsedMs: 2000 };

  it("validates damaged items and kinds", () => {
    const ok = reportSchema.safeParse({ ...base, outcome: "damaged", damagedItems: ["athletic"], damageKinds: ["melted", "lost_stretch"] });
    expect(ok.success).toBe(true);
    expect(reportSchema.safeParse({ ...base, outcome: "damaged", damageKinds: ["exploded"] }).success).toBe(false);
    expect(reportSchema.safeParse({ ...base, outcome: "good", loadSize: "overstuffed" }).success).toBe(true);
  });

  it("washers can report damaged clothes, which shows as Caution", () => {
    expect(checkForKind("washer", reportSchema.parse({ ...base, outcome: "damaged" }))).toBeNull();
    const now = Date.UTC(2026, 8, 30);
    const s = computeStatus({ kind: "washer", adminState: null, statusResetAt: null }, [{ createdAt: now - 1000, outcome: "damaged", setting: "hot", symptoms: [], deviceHash: "d", trust: 1 }], now);
    expect(s).toMatchObject({ level: "caution", reason: "Damaged clothes" });
  });

  it("summarizes damage and load for the report lists", () => {
    expect(damageSummary({ damagedItems: ["prints", "athletic"], damageKinds: ["print_cracked"] })).toBe("Damaged: Graphic tees, Athletic / stretch (Print cracked)");
    expect(damageSummary({ damagedItems: null, damageKinds: ["shrunk"] })).toBe("Damaged: clothes (Shrunk)");
    expect(damageSummary({ damagedItems: [], damageKinds: null })).toBeNull();
    expect(loadSummary({ loadSize: "overstuffed", fabrics: ["towels"] })).toBe("Packed load · Towels & bedding");
    expect(loadSummary({ loadSize: null, fabrics: null })).toBeNull();
  });
});

describe("packed loads", () => {
  const rules = toFabricRules(DEFAULT_CONFIG);
  it("warns on a packed dryer or washer", () => {
    expect(suggestForLoad("dryer", { fabrics: [], size: "overstuffed" }, rules, null)!.tips.join(" ")).toMatch(/Split it into two loads/);
    expect(suggestForLoad("washer", { fabrics: ["towels"], size: "overstuffed" }, rules, null)!.tips.join(" ")).toMatch(/won't get clean/);
  });
});
