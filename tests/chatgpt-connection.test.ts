import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose";
import type { DB } from "../src/lib/db";

let testDb: DB;
let verificationKeys: JWTVerifyGetKey;
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ host: "localhost:3000" })) }));
vi.mock("../src/lib/admin-auth", () => ({ isAdmin: vi.fn(async () => true) }));
vi.mock("../src/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("../src/lib/db", async (original) => ({ ...await original<typeof import("../src/lib/db")>(), getDb: () => testDb }));
vi.mock("jose", async (original) => ({ ...await original<typeof import("jose")>(), createRemoteJWKSet: () => (...args: Parameters<JWTVerifyGetKey>) => verificationKeys(...args) }));

import { createDb } from "../src/lib/db";
import { beginChatGPT, stageChatGPTCallback, finishChatGPT, chatGPTSummary, chatGPTModels, selectChatGPT, disconnectChatGPT, canUseChatGPT } from "../src/lib/chatgpt-server";
import { isAdmin } from "../src/lib/admin-auth";
import { AUTH_ORIGIN, RESOURCE } from "../src/lib/chatgpt-oauth";
import { GET as callbackRoute } from "../src/app/api/chatgpt/callback/route";
let privateKey: CryptoKey;
beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  verificationKeys = createLocalJWKSet({ keys: [{ ...jwk, kid: "test" }] });
  testDb = createDb("file::memory:");
});
beforeEach(async () => {
  vi.stubEnv("SESSION_SECRET", "test-only-secret-at-least-32-characters");
  vi.stubEnv("PUBLIC_BASE_URL", "http://localhost:3000");
  vi.stubEnv("DATABASE_URL", "file:local.db");
  await testDb.run(sql`DROP TABLE IF EXISTS settings`);
  await testDb.run(sql`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`);
  vi.mocked(isAdmin).mockResolvedValue(true);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function connect(expiresIn = 3600, throughRoute = false) {
  const pending = await beginChatGPT("http://localhost:3000", false);
  const authorization = new URL(pending.url);
  const idToken = await new SignJWT({ nonce: authorization.searchParams.get("nonce"), email: "test@example.com" }).setProtectedHeader({ alg: "RS256", kid: "test" }).setIssuer(AUTH_ORIGIN).setAudience("oaiapp_test").setSubject("test-user").setIssuedAt().setExpirationTime("5m").sign(privateKey);
  const fetchMock = vi.fn(async (url: unknown, init?: RequestInit) => {
    if (String(url) === `${RESOURCE}/models`) return Response.json({ models: [{ slug: "allowed-model", display_name: "Allowed model", visibility: "list" }, { slug: "hidden-model", display_name: "Hidden", visibility: "hidden" }] });
    if (String(url).endsWith("openid-configuration")) return Response.json({ revocation_endpoint: `${AUTH_ORIGIN}/revoke` });
    if (String(url).endsWith("/revoke")) return new Response(null, { status: 200 });
    const refresh = String(init?.body).includes("refresh_token");
    return Response.json({ access_token: refresh ? "renewed-access-secret" : "access-secret", refresh_token: refresh ? "renewed-refresh-secret" : "refresh-secret", id_token: idToken, expires_in: refresh ? 3600 : expiresIn, token_type: "Bearer", ...(refresh ? {} : { scope: "openid resource.invoke chatgpt.tokens.use.direct offline_access" }) });
  });
  vi.stubGlobal("fetch", fetchMock);
  const callback = new URL(authorization.searchParams.get("redirect_uri")!);
  callback.search = new URLSearchParams({ state: authorization.searchParams.get("state")!, code: "test-code", client_id: "oaiapp_test" }).toString();
  let staged;
  if (throughRoute) {
    const reconstructed = new URL(callback);
    reconstructed.hostname = "localhost";
    const response = await callbackRoute(new Request(reconstructed, { headers: { host: "127.0.0.1:3000" } }));
    expect(response.status).toBe(303);
    const destination = new URL(response.headers.get("location")!);
    expect(destination.origin + destination.pathname).toBe("http://localhost:3000/api/chatgpt/complete");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    staged = { state: destination.searchParams.get("state")! };
  } else {
    staged = await stageChatGPTCallback(callback);
  }
  return { pending, authorization, callback, staged, fetchMock };
}

describe("local ChatGPT connection", () => {
  it("completes sign-in through the route with Next's reconstructed localhost URL", async () => {
    const flow = await connect(3600, true);
    await finishChatGPT(flow.staged.state, flow.pending.binding);
    expect((await chatGPTSummary()).connected).toBe(true);
    const exchange = flow.fetchMock.mock.calls.find(([url]) => String(url).endsWith("/oauth/token"));
    expect(new URLSearchParams(String(exchange?.[1]?.body)).get("redirect_uri")).toBe("http://127.0.0.1:3000/api/chatgpt/callback");
  });
  it("binds completion to the initiating browser, stores tokens encrypted, and consumes callbacks once", async () => {
    const flow = await connect();
    await expect(finishChatGPT(flow.staged.state, "wrong-browser")).rejects.toThrow("browser that started");
    expect((await chatGPTSummary()).connected).toBe(false);
    await finishChatGPT(flow.staged.state, flow.pending.binding);
    expect((await chatGPTSummary()).connected).toBe(true);
    const rows = await testDb.all<{ value: string }>(sql`SELECT value FROM settings`);
    expect(JSON.stringify(rows)).not.toContain("access-secret");
    expect(JSON.stringify(rows)).not.toContain("test@example.com");
    await expect(stageChatGPTCallback(flow.callback)).rejects.toThrow();
    await expect(finishChatGPT(flow.staged.state, flow.pending.binding)).rejects.toThrow();
  });
  it("reuses the issued registration and stable host on reconnect", async () => {
    const flow = await connect();
    await finishChatGPT(flow.staged.state, flow.pending.binding);
    const again = new URL((await beginChatGPT("http://localhost:3000", false)).url);
    expect(again.searchParams.get("client_id")).toBe("oaiapp_test");
    expect(again.searchParams.get("ext_agent_host_id")).toBe(flow.authorization.searchParams.get("ext_agent_host_id"));
    const other = new URL((await beginChatGPT("http://localhost:3000", true)).url);
    expect(other.searchParams.get("client_id")).toBe("dynamic_agent_client");
  });
  it("only saves models advertised for the selected account", async () => {
    const flow = await connect();
    await finishChatGPT(flow.staged.state, flow.pending.binding);
    expect(await chatGPTModels()).toEqual([{ id: "allowed-model", name: "Allowed model" }]);
    await expect(selectChatGPT("oaiapp_test", "hidden-model")).rejects.toThrow("available");
    await selectChatGPT("oaiapp_test", "allowed-model");
    expect((await chatGPTSummary()).model).toBe("allowed-model");
  });
  it("serializes rotating-token refresh and retains scopes when renewal omits them", async () => {
    const flow = await connect(1);
    await finishChatGPT(flow.staged.state, flow.pending.binding);
    await Promise.all([chatGPTModels(), chatGPTModels()]);
    const refreshCalls = flow.fetchMock.mock.calls.filter(([, init]) => String(init?.body).includes("grant_type=refresh_token"));
    expect(refreshCalls).toHaveLength(1);
    expect(String(refreshCalls[0][1]?.body)).toContain("client_id=oaiapp_test");
    expect((await chatGPTSummary()).connected).toBe(true);
  });
  it("clears local tokens on disconnect and retains the issued registration", async () => {
    const flow = await connect();
    await finishChatGPT(flow.staged.state, flow.pending.binding);
    expect(await disconnectChatGPT()).toBe(true);
    expect((await chatGPTSummary()).connected).toBe(false);
    expect((await chatGPTSummary()).accounts[0].clientId).toBe("oaiapp_test");
    const rows = await testDb.all<{ value: string }>(sql`SELECT value FROM settings WHERE key = 'secret.chatgptAccounts'`);
    expect(rows).toHaveLength(1);
  });
  it("rejects access from non-admins and remote deployments", async () => {
    vi.mocked(isAdmin).mockResolvedValue(false);
    expect(await canUseChatGPT()).toBe(false);
    vi.mocked(isAdmin).mockResolvedValue(true);
    vi.stubEnv("PUBLIC_BASE_URL", "https://laundry.example.com");
    expect(await canUseChatGPT()).toBe(false);
    await expect(beginChatGPT("https://laundry.example.com", false)).rejects.toThrow("localhost only");
  });
});
