import { describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "../src/lib/turnstile";

const reply = (json: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => json }) as Response);

describe("verifyTurnstile", () => {
  it("accepts a token Cloudflare says is valid, sending secret, token and IP", async () => {
    const fetchImpl = reply({ success: true });
    expect(await verifyTurnstile("tok", "1.2.3.4", { secret: "s", fetchImpl })).toBe(true);
    const body = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as URLSearchParams;
    expect(Object.fromEntries(body)).toEqual({ secret: "s", response: "tok", remoteip: "1.2.3.4" });
  });

  it("rejects missing tokens, failures and network errors", async () => {
    expect(await verifyTurnstile(undefined, "ip", { secret: "s", fetchImpl: reply({ success: true }) })).toBe(false);
    expect(await verifyTurnstile("tok", "ip", { secret: "s", fetchImpl: reply({ success: false }) })).toBe(false);
    expect(await verifyTurnstile("tok", "ip", { secret: "s", fetchImpl: reply({}, false) })).toBe(false);
    const boom = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await verifyTurnstile("tok", "ip", { secret: "s", fetchImpl: boom as unknown as typeof fetch })).toBe(false);
  });
});
