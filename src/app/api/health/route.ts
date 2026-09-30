import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { settings } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Liveness + "is the database migrated?" for uptime monitors and post-deploy checks. No secrets, no data. */
export async function GET() {
  try {
    await getDb().select({ n: sql<number>`count(*)` }).from(settings);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "database unavailable or not migrated (run npm run db:migrate)" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
