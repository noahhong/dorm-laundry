import "server-only";
import { notLike } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "./db";
import { settings } from "./db/schema";
import { type Config, type FieldKey, resolveConfig } from "./config";
import { audit } from "./audit";

/** Current config. Memoized per request (every page is dynamic), so it costs one small query. */
export const getConfig = cache(async (): Promise<Config> => {
  try {
    const rows = await getDb().select().from(settings);
    return resolveConfig(rows);
  } catch {
    // e.g. the migration hasn't been applied yet: keep the site up on defaults.
    return resolveConfig([]);
  }
});

/** Persist only the values that changed, and write one audit entry listing before → after. */
export async function saveConfig(next: Config, previous: Config) {
  const changed = (Object.keys(next) as FieldKey[]).filter((k) => next[k] !== previous[k]);
  if (changed.length === 0) return changed;
  const now = Date.now();
  const db = getDb();
  for (const k of changed) {
    await db
      .insert(settings)
      .values({ key: k, value: next[k], updatedAt: now })
      .onConflictDoUpdate({ target: settings.key, set: { value: next[k], updatedAt: now } });
  }
  await audit("settings.update", null, Object.fromEntries(changed.map((k) => [k, { from: previous[k], to: next[k] }])));
  return changed;
}

export async function resetConfig() {
  const db = getDb();
  // Rules only: saved secrets such as the laundry helper's API key (src/lib/api-key.ts) survive a reset.
  await db.delete(settings).where(notLike(settings.key, "secret.%"));
  await audit("settings.reset", null, null);
}
