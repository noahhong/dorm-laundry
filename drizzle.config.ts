import { defineConfig } from "drizzle-kit";

// The "turso" dialect talks libSQL, which handles both local `file:` DBs and remote Turso URLs.
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:local.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
});
