import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const DEV_SECRET = "dev-only-secret-change-me-dev-only-secret";

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error("SESSION_SECRET must be set (16+ chars) in production");
  }
  return DEV_SECRET;
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export const hmac = (s: string) => createHmac("sha256", sessionSecret()).update(s).digest("base64url");

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
