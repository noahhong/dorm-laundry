// Run before (and after) deploying: `npm run preflight` with the production env vars set.
// Checks configuration and that the database is reachable and migrated. Exits 1 on any failure.
import { createClient } from "@libsql/client";

type Check = { name: string; ok: boolean; detail: string; warn?: boolean };
const checks: Check[] = [];
const add = (name: string, ok: boolean, detail: string, warn = false) => checks.push({ name, ok, detail, warn });
const env = (k: string) => process.env[k] ?? "";

const dbUrl = env("DATABASE_URL");
add("DATABASE_URL", /^libsql:\/\/|^https:\/\//.test(dbUrl), dbUrl ? (dbUrl.startsWith("file:") ? "is a local file: fine for dev, not for Vercel (files don't persist)" : "set") : "missing (use your Turso libsql:// URL)");
add("DATABASE_AUTH_TOKEN", env("DATABASE_AUTH_TOKEN").length > 20, env("DATABASE_AUTH_TOKEN") ? "set" : "missing (turso db tokens create <db>)");
add("ADMIN_PASSWORD", env("ADMIN_PASSWORD").length >= 12, env("ADMIN_PASSWORD").length >= 12 ? "set (12+ chars)" : "missing or shorter than 12 characters");
add("SESSION_SECRET", env("SESSION_SECRET").length >= 32, env("SESSION_SECRET").length >= 32 ? "set (32+ chars)" : "missing or shorter than 32 characters (openssl rand -base64 32)");
const base = env("PUBLIC_BASE_URL");
add("PUBLIC_BASE_URL", /^https:\/\/[^/]+$/.test(base), base ? (/^https:\/\/[^/]+$/.test(base) ? base : "must be https://your-domain with no trailing slash") : "missing (QR stickers would point at the wrong address)");
const ts = Number(Boolean(env("TURNSTILE_SITE_KEY"))) + Number(Boolean(env("TURNSTILE_SECRET_KEY")));
add("Turnstile bot check", ts !== 1, ts === 2 ? "enabled" : ts === 0 ? "off (optional; turn on if spam appears)" : "only one of TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY is set: the check stays off", ts === 0);

async function main() {
  if (dbUrl) {
    try {
      const client = createClient({ url: dbUrl, authToken: env("DATABASE_AUTH_TOKEN") || undefined });
      const tables = (await client.execute("select name from sqlite_master where type='table'")).rows.map((r) => String(r.name));
      const need = ["buildings", "rooms", "machines", "reports", "settings", "audit_log", "login_failures"];
      const missing = need.filter((t) => !tables.includes(t));
      add("Database reachable", true, "connected");
      add("Database migrated", missing.length === 0, missing.length ? `missing tables: ${missing.join(", ")} (run npm run db:migrate)` : "all tables present");
      if (missing.length === 0) {
        const n = Number((await client.execute("select count(*) n from machines")).rows[0].n);
        add("Machines", n > 0, n > 0 ? `${n} machine${n === 1 ? "" : "s"}` : "none yet: add rooms and machines in /admin (or npm run db:seed for demo data)", n === 0);
      }
    } catch (e) {
      add("Database reachable", false, `${(e as Error).message}`);
    }
  }
  for (const c of checks) console.log(`${c.ok ? "✓" : c.warn ? "!" : "✗"} ${c.name.padEnd(22)} ${c.detail}`);
  const failed = checks.filter((c) => !c.ok && !c.warn);
  console.log(failed.length ? `\n${failed.length} problem${failed.length === 1 ? "" : "s"} to fix before deploying.` : "\nAll good. Ready to deploy.");
  process.exit(failed.length ? 1 : 0);
}
main();
