import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const DEV_SECRET = "dev-only-secret-change-me-dev-only-secret";
export const MIN_SECRET_LENGTH = 32;

/**
 * The secret signs the admin cookie and salts device/IP hashes. The public dev fallback is only allowed in
 * `next dev` (or with an explicit ALLOW_DEV_SECRET=1), so a staging/preview deploy that forgot the variable
 * fails loudly instead of accepting forgeable admin cookies.
 */
export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= MIN_SECRET_LENGTH) return s;
  if (process.env.NEXT_PHASE === "phase-production-build") return s || DEV_SECRET; // build only; no request-time use
  if (process.env.NODE_ENV === "development" || process.env.ALLOW_DEV_SECRET === "1") return DEV_SECRET;
  throw new Error(`SESSION_SECRET must be set to ${MIN_SECRET_LENGTH}+ random characters (openssl rand -base64 32)`);
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export const hmac = (s: string) => createHmac("sha256", sessionSecret()).update(s).digest("base64url");

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
