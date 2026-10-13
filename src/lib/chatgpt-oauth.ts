import { createHash, randomBytes } from "node:crypto";
import { jwtVerify, type JWTVerifyGetKey } from "jose";

export class ChatGPTPlanError extends Error {}

export const AUTH_ORIGIN = "https://auth.openai.com";
export const RESOURCE = "https://api.openai.com/v1";
export const PLAN_SCOPE = "chatgpt.tokens.use.direct";
export const SCOPES = `openid profile email offline_access resource.invoke ${PLAN_SCOPE}`;
export const PENDING_COOKIE = "dl_chatgpt_connect";
export const randomValue = () => randomBytes(32).toString("base64url");

export function localOrigin(value: string | undefined): string | null {
  try {
    const url = new URL(value || "http://localhost:3000");
    return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname) && !url.username && !url.password ? url.origin : null;
  } catch { return null; }
}

export function callbackUri(origin: string) {
  const url = new URL(origin);
  url.hostname = "127.0.0.1";
  url.pathname = "/api/chatgpt/callback";
  return url.href;
}

/** Next.js builds req.url from its listening hostname, which may differ from
 * the loopback address used by OAuth. Accept only the configured callback host. */
export function callbackRequestUrl(request: Request, origin: string) {
  const expected = new URL(callbackUri(origin));
  const url = new URL(request.url);
  if (url.protocol !== expected.protocol || request.headers.get("host") !== expected.host || url.pathname !== expected.pathname) {
    throw new ChatGPTPlanError("Callback address did not match");
  }
  url.host = expected.host;
  return url;
}

export function authorizationUrl(pending: { state: string; nonce: string; verifier: string; redirectUri: string; hostId: string; clientId?: string; loginHint?: string }) {
  const url = new URL(`${AUTH_ORIGIN}/api/accounts/authorize`);
  url.search = new URLSearchParams({
    client_id: pending.clientId || "dynamic_agent_client",
    ext_agent_host_id: pending.hostId,
    response_type: "code", redirect_uri: pending.redirectUri, scope: SCOPES, resource: RESOURCE,
    state: pending.state, nonce: pending.nonce,
    code_challenge_method: "S256", code_challenge: createHash("sha256").update(pending.verifier).digest("base64url"),
    ...(!pending.clientId ? { agent_name_hint: "Dorm Laundry" } : {}),
    ...(pending.loginHint ? { login_hint: pending.loginHint } : {}),
  }).toString();
  return url.href;
}

export function issuedClientId(value: string | null, existing?: string) {
  if (existing) {
    if (value && value !== existing) throw new Error("ChatGPT registration did not match");
    return existing;
  }
  if (!value || value === "dynamic_agent_client" || !/^oaiapp_[A-Za-z0-9_-]+$/.test(value)) throw new Error("ChatGPT registration was incomplete");
  return value;
}

export function planAllowed(scopes: string[]) {
  return scopes.includes(PLAN_SCOPE) && scopes.includes("resource.invoke");
}


export async function verifyChatGPTIdentity(idToken: string, key: JWTVerifyGetKey, clientId: string, nonce: string, subject?: string) {
  const { payload } = await jwtVerify(idToken, key, { issuer: AUTH_ORIGIN, audience: clientId, requiredClaims: ["sub", "exp", "iat", "nonce"], clockTolerance: 5 });
  if (payload.nonce !== nonce || !payload.sub || (subject && payload.sub !== subject)) throw new ChatGPTPlanError("ChatGPT identity did not match");
  return { subject: payload.sub, email: typeof payload.email === "string" ? payload.email : "" };
}
