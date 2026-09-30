import { migrate } from "drizzle-orm/libsql/migrator";
import { createDb, databaseUrl } from "../src/lib/db";

async function main() {
  const db = createDb();
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log(`✓ migrated ${databaseUrl().replace(/\?.*/, "")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
