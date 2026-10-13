import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { AUTH_ORIGIN, authorizationUrl, callbackUri, callbackRequestUrl, issuedClientId, localOrigin, planAllowed, verifyChatGPTIdentity } from "../src/lib/chatgpt-oauth";

it("uses the actual loopback callback host when Next reconstructs the URL with localhost", () => {
  const request = new Request("http://localhost:3000/api/chatgpt/callback?state=test&code=test", { headers: { host: "127.0.0.1:3000" } });
  expect(callbackRequestUrl(request, "http://localhost:3000").href).toBe("http://127.0.0.1:3000/api/chatgpt/callback?state=test&code=test");
});
it("rejects callback requests on another host, port, protocol or path", () => {
  for (const host of ["localhost:3000", "127.0.0.1:4000", "evil.test:3000", "127.0.0.1:3000@evil.test"]) {
    expect(() => callbackRequestUrl(new Request("http://localhost:3000/api/chatgpt/callback", { headers: { host } }), "http://localhost:3000")).toThrow();
  }
  for (const url of ["https://localhost:3000/api/chatgpt/callback", "http://localhost:3000/other"]) {
    expect(() => callbackRequestUrl(new Request(url, { headers: { host: "127.0.0.1:3000" } }), "http://localhost:3000")).toThrow();
  }
});

it("allows loopback origins and rejects remote origins and embedded credentials", () => {
  expect(localOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  expect(localOrigin("https://laundry.example.com")).toBeNull();
  expect(localOrigin("http://localhost.evil.test:3000")).toBeNull();
  expect(localOrigin("http://user:password@localhost:3000")).toBeNull();
  expect(callbackUri("http://localhost:3000")).toBe("http://127.0.0.1:3000/api/chatgpt/callback");
});
it("uses dynamic registration, scopes, stable host and PKCE without a client secret", () => {
  const url = new URL(authorizationUrl({ state: "state", nonce: "nonce", verifier: "verifier", redirectUri: "http://127.0.0.1:3000/api/chatgpt/callback", hostId: "urn:uuid:host" }));
  expect(url.origin).toBe(AUTH_ORIGIN);
  expect(url.searchParams.get("client_id")).toBe("dynamic_agent_client");
  expect(url.searchParams.get("code_challenge")).toBe(createHash("sha256").update("verifier").digest("base64url"));
  expect(url.searchParams.get("scope")).toContain("chatgpt.tokens.use.direct");
  expect(url.searchParams.get("agent_name_hint")).toBe("Dorm Laundry");
  expect(url.searchParams.has("client_secret")).toBe(false);
});
it("reuses issued registration and rejects mismatches or missing issued client IDs", () => {
  expect(issuedClientId(null, "oaiapp_saved")).toBe("oaiapp_saved");
  expect(() => issuedClientId("oaiapp_other", "oaiapp_saved")).toThrow();
  expect(() => issuedClientId("dynamic_agent_client")).toThrow();
  expect(() => issuedClientId(null)).toThrow();
  const url = new URL(authorizationUrl({ state: "s", nonce: "n", verifier: "v", redirectUri: "callback", hostId: "host", clientId: "oaiapp_saved" }));
  expect(url.searchParams.get("client_id")).toBe("oaiapp_saved");
  expect(url.searchParams.has("agent_name_hint")).toBe(false);
});
it("identity scopes alone do not grant inference", () => {
  expect(planAllowed(["openid", "profile", "email"])).toBe(false);
  expect(planAllowed(["resource.invoke", "chatgpt.tokens.use.direct"])).toBe(true);
});

describe("signed ChatGPT identity", () => {
  it("verifies signature, audience, issuer, nonce, expiry and returning subject", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = await exportJWK(publicKey);
    const keys = createLocalJWKSet({ keys: [{ ...jwk, kid: "test" }] });
    const token = await new SignJWT({ nonce: "expected", email: "test@example.com" }).setProtectedHeader({ alg: "RS256", kid: "test" }).setIssuer(AUTH_ORIGIN).setAudience("oaiapp_test").setSubject("user").setIssuedAt().setExpirationTime("5m").sign(privateKey);
    expect(await verifyChatGPTIdentity(token, keys, "oaiapp_test", "expected", "user")).toEqual({ subject: "user", email: "test@example.com" });
    await expect(verifyChatGPTIdentity(token, keys, "oaiapp_test", "wrong")).rejects.toThrow();
    await expect(verifyChatGPTIdentity(token, keys, "wrong", "expected")).rejects.toThrow();
    await expect(verifyChatGPTIdentity(token, keys, "oaiapp_test", "expected", "other")).rejects.toThrow();
    const forged = token.slice(0, -10) + "AAAAAAAAAA";
    await expect(verifyChatGPTIdentity(forged, keys, "oaiapp_test", "expected")).rejects.toThrow();
    const expired = await new SignJWT({ nonce: "expected" }).setProtectedHeader({ alg: "RS256", kid: "test" }).setIssuer(AUTH_ORIGIN).setAudience("oaiapp_test").setSubject("user").setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(privateKey);
    await expect(verifyChatGPTIdentity(expired, keys, "oaiapp_test", "expected")).rejects.toThrow();
    const wrongIssuer = await new SignJWT({ nonce: "expected" }).setProtectedHeader({ alg: "RS256", kid: "test" }).setIssuer("https://evil.example").setAudience("oaiapp_test").setSubject("user").setIssuedAt().setExpirationTime("5m").sign(privateKey);
    await expect(verifyChatGPTIdentity(wrongIssuer, keys, "oaiapp_test", "expected")).rejects.toThrow();
  });
});
