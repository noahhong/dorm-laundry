import { describe, expect, it } from "vitest";
import { flagReasons, openFlags, shouldAutoHide } from "../src/lib/flags";
import { DEFAULT_CONFIG } from "../src/lib/config";

describe("report flags", () => {
  const flags = [
    { createdAt: 100, reason: "spam" },
    { createdAt: 200, reason: "rude" },
    { createdAt: 300, reason: "spam" },
  ];

  it("only counts flags since an admin last hid or kept the report", () => {
    expect(openFlags(flags, null)).toHaveLength(3);
    expect(openFlags(flags, 200).map((f) => f.createdAt)).toEqual([300]);
    expect(openFlags(flags, 300)).toEqual([]);
  });

  it("groups reasons, most common first", () => {
    expect(flagReasons(flags)).toEqual([
      ["spam", 2],
      ["rude", 1],
    ]);
    expect(flagReasons([])).toEqual([]);
  });

  it("hides at the threshold, never when it is 0, and never twice", () => {
    expect(shouldAutoHide(2, 3, false)).toBe(false);
    expect(shouldAutoHide(3, 3, false)).toBe(true);
    expect(shouldAutoHide(9, 0, false)).toBe(false);
    expect(shouldAutoHide(3, 3, true)).toBe(false);
  });

  it("defaults to three flags", () => {
    expect(DEFAULT_CONFIG.flagsToHide).toBe(3);
  });
});
