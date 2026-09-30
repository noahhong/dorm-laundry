import { eq } from "drizzle-orm";
import { isAdmin } from "@/lib/admin-auth";
import { getConfig } from "@/lib/config-server";
import { getDb } from "@/lib/db";
import { reportPhotos, reports } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/** A report's load photo. Admins always; everyone else only when photos are public and the report is visible. */
export async function GET(_req: Request, ctx: RouteContext<"/api/photos/[id]">) {
  const { id } = await ctx.params;
  const [row] = await getDb()
    .select({ bytes: reportPhotos.bytes, mime: reportPhotos.mime, hiddenAt: reports.hiddenAt, undoneAt: reports.undoneAt })
    .from(reportPhotos)
    .innerJoin(reports, eq(reportPhotos.reportId, reports.id))
    .where(eq(reportPhotos.reportId, id))
    .limit(1);
  const admin = await isAdmin();
  const publicOk = row && (await getConfig()).photosPublic && !row.hiddenAt && !row.undoneAt;
  if (!row || (!admin && !publicOk)) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.bytes), {
    headers: {
      "Content-Type": row.mime,
      "Cache-Control": admin && !publicOk ? "private, no-store" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
