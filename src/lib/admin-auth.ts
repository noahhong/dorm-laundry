import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hmac, safeEqual, sha256 } from "./secret";

const COOKIE = "dl_admin";
const TTL_MS = 7 * 24 * 3600_000;

export const MIN_PASSWORD_LENGTH = 12;

export function adminConfigured() {
  return (process.env.ADMIN_PASSWORD?.length ?? 0) >= MIN_PASSWORD_LENGTH;
}

/** Cookie signature is bound to the current password, so changing ADMIN_PASSWORD signs every admin out. */
const sign = (exp: string | number) => hmac(`admin:${exp}:${sha256(process.env.ADMIN_PASSWORD ?? "")}`);

export function checkPassword(pw: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  return adminConfigured() && safeEqual(hmac(`pw:${pw}`), hmac(`pw:${expected}`));
}

export async function startAdminSession() {
  const exp = Date.now() + TTL_MS;
  const jar = await cookies();
  jar.set(COOKIE, `${exp}.${sign(exp)}`, {
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
  const expMs = Number(exp);
  if (!exp || !sig || !Number.isFinite(expMs) || expMs < Date.now() || !adminConfigured()) return false;
  return safeEqual(sig, sign(exp));
}

export async function requireAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}
