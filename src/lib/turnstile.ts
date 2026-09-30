// Cloudflare Turnstile (free, invisible bot check). Off unless both keys are configured.
// https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function turnstileSiteKey(): string | undefined {
  return process.env.TURNSTILE_SECRET_KEY ? process.env.TURNSTILE_SITE_KEY || undefined : undefined;
}

export function turnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);
}

export async function verifyTurnstile(
  token: string | undefined,
  ip: string,
  { secret = process.env.TURNSTILE_SECRET_KEY, fetchImpl = fetch }: { secret?: string; fetchImpl?: typeof fetch } = {},
): Promise<boolean> {
  if (!token || !secret) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "unknown") body.set("remoteip", ip);
  try {
    const res = await fetchImpl(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
