import "server-only";
import { cookies, headers } from "next/headers";
import { and, count, eq, gte } from "drizzle-orm";
import { randomId } from "./ids";
import { sha256, sessionSecret } from "./secret";
import type { DB } from "./db";
import { reports } from "./db/schema";

export const DEVICE_COOKIE = "dl_device";
const YEAR = 365 * 24 * 3600;

/** Read (or, inside a Server Action, create) the anonymous device id. Returns its hash. */
export async function deviceHash({ create }: { create: boolean }): Promise<string | null> {
  const jar = await cookies();
  let id = jar.get(DEVICE_COOKIE)?.value;
  if (!id && create) {
    id = randomId(24);
    jar.set(DEVICE_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: YEAR, path: "/" });
  }
  return id ? sha256(`device:${id}:${sessionSecret()}`) : null;
}

/** Salted per day so hashes can't be joined across days. Never store the raw IP. */
export async function ipHash(now = Date.now()): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const day = new Date(now).toISOString().slice(0, 10);
  return sha256(`ip:${ip}:${day}:${sessionSecret()}`);
}

export const LIMITS = {
  perMachineMs: 3 * 60_000,
  perDevicePerDay: 30,
  perIpPerDay: 60,
};

export async function checkRateLimit(db: DB, { device, ip, machineId, now }: { device: string; ip: string; machineId: string; now: number }): Promise<string | null> {
  const dayAgo = now - 24 * 3600_000;
  const [recentSame] = await db
    .select({ n: count() })
    .from(reports)
    .where(and(eq(reports.deviceHash, device), eq(reports.machineId, machineId), gte(reports.createdAt, now - LIMITS.perMachineMs)));
  if (recentSame.n > 0) return "You just reported this machine. Give it a few minutes.";
  const [byDevice] = await db.select({ n: count() }).from(reports).where(and(eq(reports.deviceHash, device), gte(reports.createdAt, dayAgo)));
  if (byDevice.n >= LIMITS.perDevicePerDay) return "That's a lot of reports today. Try again tomorrow.";
  const [byIp] = await db.select({ n: count() }).from(reports).where(and(eq(reports.ipHash, ip), gte(reports.createdAt, dayAgo)));
  if (byIp.n >= LIMITS.perIpPerDay) return "Too many reports from this network today.";
  return null;
}
