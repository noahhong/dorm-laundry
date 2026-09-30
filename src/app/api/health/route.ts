import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** Liveness + "is the database migrated?" for uptime monitors and post-deploy checks. No secrets, no data. */
export async function GET() {
  try {
    // The newest table: if it exists, every migration has run.
    await getDb().select({ n: sql<number>`count(*)` }).from(pushSubscriptions);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "database unavailable or not migrated (run npm run db:migrate)" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
