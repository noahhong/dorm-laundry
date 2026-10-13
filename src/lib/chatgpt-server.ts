import "server-only";
import { randomUUID } from "node:crypto";
import { createRemoteJWKSet } from "jose";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { isAdmin } from "./admin-auth";
import { getDb, databaseUrl } from "./db";
import { settings } from "./db/schema";
import { seal, unseal } from "./secret-box";
import { sessionSecret, safeEqual } from "./secret";
import { audit } from "./audit";
import { verifyChatGPTIdentity, ChatGPTPlanError, AUTH_ORIGIN, RESOURCE, authorizationUrl, callbackUri, issuedClientId, localOrigin, planAllowed, randomValue } from "./chatgpt-oauth";

const STORE = "secret.chatgptAccounts";
const HOST = "secret.chatgptHost";
const pendingKey = (state: string) => `secret.chatgptPending.${state}`;
const stagedKey = (state: string) => `secret.chatgptStaged.${state}`;
const tokenSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1).optional(), id_token: z.string().optional(), token_type: z.string(), expires_in: z.number().positive(), scope: z.string().optional() });
const accountSchema = z.object({ clientId: z.string(), subject: z.string(), email: z.string(), accessToken: z.string().nullable(), refreshToken: z.string().nullable(), idToken: z.string().nullable(), expiresAt: z.number(), scopes: z.array(z.string()), model: z.string().nullable() });
const storeSchema = z.object({ activeId: z.string().nullable(), accounts: z.array(accountSchema) });
const pendingSchema = z.object({ state: z.string(), nonce: z.string(), verifier: z.string(), binding: z.string(), redirectUri: z.string(), origin: z.string(), hostId: z.string(), clientId: z.string().optional(), subject: z.string().optional(), expiresAt: z.number() });
const stageSchema = z.object({ binding: z.string(), expiresAt: z.number(), account: accountSchema });
type Account = z.infer<typeof accountSchema>;

/** Personal, local connection only. Never turn an admin's plan into a public dorm API. */
export function chatGPTLocalOrigin() {
  return !databaseUrl().startsWith("file:") || (process.env.SESSION_SECRET?.length ?? 0) < 32 ? null : localOrigin(process.env.PUBLIC_BASE_URL);
}

export async function canUseChatGPT() {
  const origin = chatGPTLocalOrigin();
  return !!origin && (await headers()).get("host") === new URL(origin).host && await isAdmin();
}

async function readSecret(key: string) {
  const [row] = await getDb().select().from(settings).where(eq(settings.key, key));
  if (typeof row?.value !== "string") return null;
  const plain = unseal(row.value, sessionSecret());
  if (!plain) return null;
  try { return JSON.parse(plain); } catch { return null; }
}
async function writeSecret(key: string, value: unknown) {
  await getDb().insert(settings).values({ key, value: seal(JSON.stringify(value), sessionSecret()), updatedAt: Date.now() })
    .onConflictDoUpdate({ target: settings.key, set: { value: seal(JSON.stringify(value), sessionSecret()), updatedAt: Date.now() } });
}
async function consumeSecret(key: string) {
  const [row] = await getDb().delete(settings).where(eq(settings.key, key)).returning();
  if (typeof row?.value !== "string") return null;
  const plain = unseal(row.value, sessionSecret());
  return plain ? JSON.parse(plain) : null;
}
async function store() {
  return storeSchema.parse(await readSecret(STORE) || { activeId: null, accounts: [] });
}
async function saveAccount(account: Account) {
  const data = await store();
  const previous = data.accounts.find((a) => a.clientId === account.clientId);
  if (previous && previous.subject !== account.subject) throw new ChatGPTPlanError("ChatGPT account did not match");
  data.accounts = [...data.accounts.filter((a) => a.clientId !== account.clientId), account];
  data.activeId = account.clientId;
  await writeSecret(STORE, data);
}

export async function chatGPTSummary() {
  const data = await store();
  const active = data.accounts.find((a) => a.clientId === data.activeId);
  return {
    accounts: data.accounts.map((a) => ({ clientId: a.clientId, label: `${a.email || "ChatGPT account"} · ${a.clientId.slice(-6)}`, connected: !!a.accessToken && planAllowed(a.scopes) })),
    activeId: data.activeId, connected: !!active?.accessToken && planAllowed(active.scopes), model: active?.model ?? null,
  };
}

export async function beginChatGPT(origin: string, addAccount: boolean) {
  if (origin !== chatGPTLocalOrigin()) throw new ChatGPTPlanError("ChatGPT subscription connection is available on localhost only");
  const data = await store();
  const active = addAccount ? undefined : data.accounts.find((a) => a.clientId === data.activeId);
  let hostId = await readSecret(HOST);
  if (typeof hostId !== "string") {
    hostId = `urn:uuid:${randomUUID()}`;
    await writeSecret(HOST, hostId);
  }
  const pending = pendingSchema.parse({
    state: randomValue(), nonce: randomValue(), verifier: randomValue(), binding: randomValue(),
    origin, redirectUri: callbackUri(origin), hostId, clientId: active?.clientId, subject: active?.subject,
    expiresAt: Date.now() + 10 * 60_000,
  });
  await writeSecret(pendingKey(pending.state), pending);
  return { url: authorizationUrl({ ...pending, loginHint: active?.email }), binding: pending.binding };
}

const jwks = createRemoteJWKSet(new URL(`${AUTH_ORIGIN}/.well-known/jwks.json`));
async function exchange(params: Record<string, string>) {
  const res = await fetch(`${AUTH_ORIGIN}/api/accounts/oauth/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params), signal: AbortSignal.timeout(15_000), cache: "no-store",
  });
  if (!res.ok) throw new ChatGPTPlanError("ChatGPT authorization failed. Please reconnect your account.");
  const tokens = tokenSchema.parse(await res.json());
  if (tokens.token_type.toLowerCase() !== "bearer") throw new ChatGPTPlanError("Unexpected ChatGPT token type");
  return tokens;
}

export async function stageChatGPTCallback(url: URL) {
  const state = url.searchParams.get("state") || "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) throw new ChatGPTPlanError("Invalid sign-in state");
  const pending = pendingSchema.parse(await consumeSecret(pendingKey(state)));
  if (pending.expiresAt < Date.now() || url.origin + url.pathname !== pending.redirectUri || pending.origin !== chatGPTLocalOrigin()) throw new ChatGPTPlanError("Sign-in expired or callback did not match");
  if (url.searchParams.has("error")) return { origin: pending.origin, state, cancelled: true };
  const code = url.searchParams.get("code");
  if (!code) throw new ChatGPTPlanError("Missing authorization code");
  const clientId = issuedClientId(url.searchParams.get("client_id"), pending.clientId);
  const tokens = await exchange({ grant_type: "authorization_code", client_id: clientId, code, code_verifier: pending.verifier, redirect_uri: pending.redirectUri, resource: RESOURCE });
  if (!tokens.id_token) throw new ChatGPTPlanError("Missing ChatGPT identity");
  const identity = await verifyChatGPTIdentity(tokens.id_token, jwks, clientId, pending.nonce, pending.subject);
  const scopes = (tokens.scope || "").split(/\s+/);
  if (!planAllowed(scopes)) throw new ChatGPTPlanError("ChatGPT plan permission was not granted. Reconnect and allow plan usage.");
  const account: Account = {
    clientId, subject: identity.subject, email: identity.email,
    accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? null, idToken: tokens.id_token,
    expiresAt: Date.now() + tokens.expires_in * 1000, scopes, model: null,
  };
  await writeSecret(stagedKey(state), { binding: pending.binding, expiresAt: pending.expiresAt, account });
  return { origin: pending.origin, state, cancelled: false };
}

export async function finishChatGPT(state: string, binding: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) throw new ChatGPTPlanError("Invalid sign-in state");
  const staged = stageSchema.parse(await readSecret(stagedKey(state)));
  if (staged.expiresAt < Date.now() || !safeEqual(staged.binding, binding)) throw new ChatGPTPlanError("Complete sign-in in the browser that started it");
  const once = stageSchema.parse(await consumeSecret(stagedKey(state)));
  await saveAccount(once.account);
  await audit("assistant.chatgpt.connect", null);
}

const refreshes = new Map<string, Promise<Account>>();
async function freshAccount(): Promise<Account> {
  const data = await store();
  const account = data.accounts.find((a) => a.clientId === data.activeId);
  if (!account?.accessToken || !planAllowed(account.scopes)) throw new ChatGPTPlanError("Connect your ChatGPT account in Settings first.");
  if (account.expiresAt > Date.now() + 60_000) return account;
  const running = refreshes.get(account.clientId);
  if (running) return running;
  const task = (async () => {
    if (!account.refreshToken) throw new ChatGPTPlanError("Your ChatGPT connection expired. Reconnect in Settings.");
    const tokens = await exchange({ grant_type: "refresh_token", client_id: account.clientId, refresh_token: account.refreshToken, resource: RESOURCE });
    const scopes = tokens.scope ? tokens.scope.split(/\s+/) : account.scopes;
    if (!planAllowed(scopes)) throw new ChatGPTPlanError("ChatGPT plan permission is no longer enabled.");
    const next = { ...account, accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? account.refreshToken, idToken: tokens.id_token ?? account.idToken, expiresAt: Date.now() + tokens.expires_in * 1000, scopes };
    const latest = await store();
    const saved = latest.accounts.find((a) => a.clientId === next.clientId);
    // Disconnecting or switching accounts while renewal is running must not reactivate the old session.
    if (!saved?.accessToken || saved.refreshToken !== account.refreshToken) throw new ChatGPTPlanError("ChatGPT account changed while reconnecting.");
    latest.accounts = latest.accounts.map((a) => a.clientId === next.clientId ? { ...next, model: a.model } : a);
    await writeSecret(STORE, latest);
    return next;
  })();
  refreshes.set(account.clientId, task);
  try { return await task; } finally { refreshes.delete(account.clientId); }
}

export async function chatGPTModels() {
  const account = await freshAccount();
  const res = await fetch(`${RESOURCE}/models`, { headers: { Authorization: `Bearer ${account.accessToken}` }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!res.ok) throw new ChatGPTPlanError("Couldn't load models for this ChatGPT account. Try reconnecting.");
  const catalog = z.object({ models: z.array(z.object({ slug: z.string(), display_name: z.string(), visibility: z.string() })) }).parse(await res.json());
  return catalog.models.filter((m) => m.visibility === "list").map((m) => ({ id: m.slug, name: m.display_name }));
}

export async function chatGPTInference() {
  if (!(await canUseChatGPT())) throw new ChatGPTPlanError("ChatGPT subscription is for signed-in local admin testing only.");
  const account = await freshAccount();
  if (!account.model) throw new ChatGPTPlanError("Choose a ChatGPT model in Settings first.");
  return { accessToken: account.accessToken!, model: account.model };
}

export async function selectChatGPT(clientId: string, model: string | null) {
  const data = await store();
  const selected = data.accounts.find((a) => a.clientId === clientId);
  if (!selected) throw new ChatGPTPlanError("Choose a saved ChatGPT account.");
  data.activeId = clientId;
  await writeSecret(STORE, data);
  if (model) {
    const models = await chatGPTModels();
    if (!models.some((m) => m.id === model)) throw new ChatGPTPlanError("Choose a model available to this account.");
    await saveAccount({ ...(await freshAccount()), model });
  }
}

export async function disconnectChatGPT() {
  const data = await store();
  const account = data.accounts.find((a) => a.clientId === data.activeId);
  if (!account) return true;
  let revoked = !account.refreshToken;
  try {
    const discovery = await fetch(`${AUTH_ORIGIN}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(15_000) }).then((r) => r.json());
    const endpoint = new URL(discovery.revocation_endpoint);
    if (endpoint.origin !== AUTH_ORIGIN) throw new ChatGPTPlanError("Invalid revocation endpoint");
    if (account.refreshToken) {
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: account.refreshToken, token_type_hint: "refresh_token", client_id: account.clientId }), signal: AbortSignal.timeout(15_000) });
      revoked = res.status === 200;
    }
  } catch { revoked = false; }
  await saveAccount({ ...account, accessToken: null, refreshToken: null, idToken: null, scopes: [], expiresAt: 0 });
  await audit("assistant.chatgpt.disconnect", null, { revoked });
  return revoked;
}
