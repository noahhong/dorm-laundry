import { afterEach, describe, expect, it, vi } from "vitest";
import { pickClientIp } from "../src/lib/client-ip";
import { MIN_SECRET_LENGTH, sessionSecret } from "../src/lib/secret";
import { reportSchema } from "../src/lib/validation";

const headers = (h: Record<string, string>) => ({ get: (k: string) => h[k.toLowerCase()] ?? null });

describe("pickClientIp", () => {
  it("prefers platform-set headers over a client-appendable X-Forwarded-For", () => {
    expect(pickClientIp(headers({ "x-vercel-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2", "x-forwarded-for": "6.6.6.6, 1.1.1.1" }))).toBe("1.1.1.1");
    expect(pickClientIp(headers({ "x-real-ip": "2.2.2.2", "x-forwarded-for": "6.6.6.6" }))).toBe("2.2.2.2");
    expect(pickClientIp(headers({ "x-forwarded-for": "3.3.3.3, 4.4.4.4" }))).toBe("3.3.3.3");
    expect(pickClientIp(headers({}))).toBe("unknown");
  });
});

describe("sessionSecret", () => {
  afterEach(() => vi.unstubAllEnvs());
  const good = "x".repeat(MIN_SECRET_LENGTH);

  it("accepts a long-enough secret anywhere", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SECRET", good);
    expect(sessionSecret()).toBe(good);
  });

  it("refuses to run without one outside `next dev`, including staging-like environments", () => {
    for (const env of ["production", "test", "staging"]) {
      vi.stubEnv("NODE_ENV", env);
      vi.stubEnv("SESSION_SECRET", "short");
      expect(() => sessionSecret(), env).toThrow(/SESSION_SECRET/);
    }
  });

  it("allows the public dev secret only in dev or with an explicit opt-in", () => {
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(sessionSecret()).toContain("dev-only");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_DEV_SECRET", "1");
    expect(sessionSecret()).toContain("dev-only");
  });
});

describe("reportSchema bot checks", () => {
  const base = { code: "hsd1", outcome: "dry", setting: "low", symptoms: [] as string[] };
  it("requires elapsedMs, so omitting it can't skip the minimum-time check", () => {
    expect(reportSchema.safeParse(base).success).toBe(false);
    expect(reportSchema.safeParse({ ...base, elapsedMs: 5000 }).success).toBe(true);
  });
  it("parses a filled honeypot (the action drops it silently) instead of rejecting", () => {
    const r = reportSchema.safeParse({ ...base, elapsedMs: 5000, website: "http://spam" });
    expect(r.success && r.data.website).toBe("http://spam");
  });
});
