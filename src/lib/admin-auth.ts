import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hmac, safeEqual } from "./secret";

const COOKIE = "dl_admin";
const TTL_MS = 7 * 24 * 3600_000;

export function adminConfigured() {
  return Boolean(process.env.ADMIN_PASSWORD);
}

export function checkPassword(pw: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  return Boolean(expected) && safeEqual(hmac(`pw:${pw}`), hmac(`pw:${expected}`));
}

export async function startAdminSession() {
  const exp = Date.now() + TTL_MS;
  const jar = await cookies();
  jar.set(COOKIE, `${exp}.${hmac(`admin:${exp}`)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: TTL_MS / 1000,
    path: "/",
  });
}

export async function endAdminSession() {
  (await cookies()).delete(COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const v = (await cookies()).get(COOKIE)?.value;
  if (!v) return false;
  const [exp, sig] = v.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, hmac(`admin:${exp}`));
}

export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}
