import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { audit } from "./audit";
import { getDb } from "./db";
import { settings } from "./db/schema";
import { sessionSecret } from "./secret";
import { seal, unseal } from "./secret-box";

/**
 * Provider API keys for the laundry helper. Each provider's environment key wins; otherwise the key an
 * admin saved in Settings, stored encrypted in the `settings` table under a key the config form never reads.
 */
export const API_KEY_ROW = "secret.anthropicApiKey";

export type KeySource = { source: "env" | "admin"; key: string } | { source: null; key: null };

export type AssistantProvider = "anthropic" | "openai";
const keyRow = (provider: AssistantProvider) => provider === "openai" ? "secret.openaiApiKey" : API_KEY_ROW;

export const getProviderKey = cache(async (provider: AssistantProvider): Promise<KeySource> => {
  const env = (provider === "openai" ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY)?.trim();
  if (env) return { source: "env", key: env };
  try {
    const [row] = await getDb().select().from(settings).where(eq(settings.key, keyRow(provider)));
    const key = typeof row?.value === "string" ? unseal(row.value, sessionSecret()) : null;
    return key ? { source: "admin", key } : { source: null, key: null };
  } catch {
    return { source: null, key: null };
  }
});

export const getAnthropicKey = () => getProviderKey("anthropic");

/** "…Ab3x": enough for an admin to recognise which key it is, never the key itself. */
export const keyHint = (key: string) => `…${key.slice(-4)}`;

/** Loose shape check so a paste of the wrong thing is caught before saving. */
export function looksLikeAnthropicKey(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,300}$/.test(key);
}

export async function saveProviderKey(provider: AssistantProvider, key: string) {
  const now = Date.now();
  const value = seal(key, sessionSecret());
  await getDb()
    .insert(settings)
    .values({ key: keyRow(provider), value, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } });
  await audit("assistant.key.save", null, { provider, hint: keyHint(key) });
}

export async function clearProviderKey(provider: AssistantProvider) {
  await getDb().delete(settings).where(eq(settings.key, keyRow(provider)));
  await audit("assistant.key.remove", null, { provider });
}
