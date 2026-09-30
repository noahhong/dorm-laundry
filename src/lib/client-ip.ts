/**
 * Client IP for rate limiting. Prefers headers the hosting platform sets itself (Vercel overwrites these, so a
 * client can't forge them) over the client-appendable X-Forwarded-For. Behind a proxy you control, make sure it
 * overwrites one of the first two headers.
 */
export function pickClientIp(h: { get(name: string): string | null }): string {
  return (
    h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
