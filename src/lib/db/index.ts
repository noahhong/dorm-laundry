import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export type DB = LibSQLDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __dlClient?: Client; __dlDb?: DB };

export function databaseUrl() {
  return process.env.DATABASE_URL ?? "file:local.db";
}

export function createDb(url = databaseUrl(), authToken = process.env.DATABASE_AUTH_TOKEN): DB {
  const client = createClient({ url, authToken });
  return drizzle(client, { schema });
}

/** Shared connection, reused across hot reloads in dev. */
export function getDb(): DB {
  if (!globalForDb.__dlDb) {
    globalForDb.__dlDb = createDb();
  }
  return globalForDb.__dlDb;
}

export { schema };
